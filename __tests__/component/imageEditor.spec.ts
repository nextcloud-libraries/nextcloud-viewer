/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { makeFile } from '../factories.ts'

const axiosPut = vi.hoisted(() => vi.fn())
vi.mock('@nextcloud/axios', () => ({ default: { put: axiosPut } }))
vi.mock('@nextcloud/event-bus')
vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn(), showSuccess: vi.fn() }))
// Avoid loading the real (canvas/webgl) editor; expose a stub that re-emits.
vi.mock('@nextcloud/image-editor', () => ({
	ImageEditor: defineComponent({
		name: 'LibImageEditor',
		emits: ['save', 'cancel', 'error'],
		template: '<div class="image-editor-stub" />',
	}),
}))

import { showError } from '@nextcloud/dialogs'
import { emit } from '@nextcloud/event-bus'
import ImageEditor from '../../lib/components/ImageEditor.vue'

describe('ImageEditor wrapper', () => {
	beforeEach(() => {
		axiosPut.mockReset()
		axiosPut.mockResolvedValue({ headers: { 'oc-etag': '"abc123"' } })
	})

	const mountEditor = () => {
		const file = makeFile({ basename: 'photo.jpg', mime: 'image/jpeg' })
		const wrapper = mount(ImageEditor, { props: { file } })
		return { wrapper, file, editor: wrapper.findComponent({ name: 'LibImageEditor' }) }
	}

	it('saves the exported blob over the file, emits its object URL and refreshes the node', async () => {
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:edited')
		const { wrapper, file, editor } = mountEditor()
		const blob = new Blob(['x'], { type: 'image/jpeg' })

		editor.vm.$emit('save', { blob, width: 1, height: 1, mimeType: 'image/jpeg' })
		await flushPromises()

		// No etag known for this one, so there is no version to write against
		expect(axiosPut).toHaveBeenCalledWith(file.encodedSource, blob, { headers: undefined })
		expect(file.attributes.etag).toBe('abc123')
		expect(wrapper.emitted('saved')).toEqual([['blob:edited']])
		expect(vi.mocked(emit)).toHaveBeenCalledWith('files:node:updated', file)
		expect(wrapper.emitted('close')).toBeTruthy()
	})

	// The editor has the file on screen for as long as the user works on it,
	// and a blind PUT at the end of that writes over whatever happened to it
	// in the meantime
	it('saves against the version it opened', async () => {
		const file = makeFile({ basename: 'photo.jpg', mime: 'image/jpeg', attributes: { etag: 'abc123' } })
		const wrapper = mount(ImageEditor, { props: { file } })
		const blob = new Blob(['x'], { type: 'image/jpeg' })

		wrapper.findComponent({ name: 'LibImageEditor' }).vm.$emit('save', { blob, width: 1, height: 1, mimeType: 'image/jpeg' })
		await flushPromises()

		expect(axiosPut).toHaveBeenCalledWith(file.encodedSource, blob, {
			headers: { 'If-Match': '"abc123"' },
		})
	})

	it('says what happened when the file changed under the editor', async () => {
		axiosPut.mockRejectedValueOnce({ response: { status: 412 } })
		const { wrapper, editor } = mountEditor()

		editor.vm.$emit('save', { blob: new Blob(['x']), width: 1, height: 1, mimeType: 'image/jpeg' })
		await flushPromises()

		expect(vi.mocked(showError)).toHaveBeenCalledWith(expect.stringContaining('changed elsewhere'))
		// Still open: the work is not lost along with the save
		expect(wrapper.emitted('close')).toBeUndefined()
	})

	it('closes without saving on cancel', async () => {
		const { wrapper, editor } = mountEditor()
		editor.vm.$emit('cancel')
		await flushPromises()
		expect(axiosPut).not.toHaveBeenCalled()
		expect(wrapper.emitted('close')).toBeTruthy()
	})
})
