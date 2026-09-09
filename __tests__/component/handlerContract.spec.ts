/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFile } from '@nextcloud/files'
import type { ViewerEmits, ViewerProps } from '../../lib/viewer.ts'

import { flushPromises } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, defineCustomElement, h } from 'vue'
import { makeFile, makeHandler } from '../factories.ts'
import { mountViewer } from './mountViewer.ts'

/** Every set of props the probe handler has been rendered with, in order */
const renders: ViewerProps[] = []
/** The last mounted probe instance, so a test can emit from it */
let emitFromProbe: ((event: keyof ViewerEmits, payload?: unknown) => void) | undefined

/**
 * A handler written the way the README tells an app to write one: a component
 * declaring ViewerProps and ViewerEmits, defined as a custom element.
 */
const Probe = defineComponent({
	props: {
		file: { type: Object, required: true },
		files: { type: Array, default: () => [] },
		maxHeight: { type: Number, default: 0 },
		maxWidth: { type: Number, default: 0 },
		editing: { type: Boolean, default: false },
		isSidebarShown: { type: Boolean, default: false },
		localSource: { type: String, default: undefined },
	},
	emits: ['loaded', 'errored', 'update:canSwipe', 'update:editing'],
	setup(props, { emit }) {
		emitFromProbe = (event, payload) => emit(event as 'loaded', payload as never)
		return () => {
			renders.push({ ...props } as unknown as ViewerProps)
			return h('div', { class: 'probe' }, String((props.file as IFile)?.basename))
		}
	},
})

beforeAll(() => {
	if (!window.customElements.get('oca-viewer-probe')) {
		window.customElements.define('oca-viewer-probe', defineCustomElement(Probe, { shadowRoot: false }))
	}
})

function probeHandler(overrides = {}) {
	return makeHandler({
		id: 'probe',
		tagname: 'oca-viewer-probe',
		enabled: () => true,
		...overrides,
	})
}

/**
 * The props the handler was rendered with most recently.
 */
function lastRender(): ViewerProps {
	return renders[renders.length - 1]!
}

describe('what a handler is given', () => {
	it('receives the open file and the list it belongs to', async () => {
		renders.length = 0
		const f1 = makeFile({ basename: 'a.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'b.jpg', mime: 'image/jpeg' })
		const { vm, wrapper } = mountViewer([probeHandler()])

		await vm.open([f1, f2], f1)
		await wrapper.vm.$nextTick()
		await flushPromises()

		expect(lastRender().file.basename).toBe('a.jpg')
		expect(lastRender().files.map((file) => file.basename)).toEqual(['a.jpg', 'b.jpg'])
	})

	it('receives the size the viewer gives it, and whether the sidebar is open', async () => {
		renders.length = 0
		const f1 = makeFile({ mime: 'image/jpeg' })
		const { vm, wrapper } = mountViewer([probeHandler()])

		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()
		await flushPromises()

		expect(typeof lastRender().maxHeight).toBe('number')
		expect(typeof lastRender().maxWidth).toBe('number')
		expect(lastRender().isSidebarShown).toBe(false)
	})

	it('is rendered again for the next file, with that file', async () => {
		renders.length = 0
		const f1 = makeFile({ basename: 'first.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'second.jpg', mime: 'image/jpeg' })
		const { vm, wrapper, emitModal } = mountViewer([probeHandler()])

		await vm.open([f1, f2], f1)
		await wrapper.vm.$nextTick()
		await flushPromises()
		const first = wrapper.find('oca-viewer-probe').element

		await emitModal('next')
		await flushPromises()

		expect(lastRender().file.basename).toBe('second.jpg')
		// Keyed on the file id, so the handler gets a fresh element rather than
		// having to watch its own `file` prop for a change
		expect(wrapper.find('oca-viewer-probe').element).not.toBe(first)
	})

	it('sees the list grow when the viewer loads more', async () => {
		renders.length = 0
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		const f3 = makeFile({ basename: 'f3.jpg', mime: 'image/jpeg' })
		const loadMore = vi.fn().mockResolvedValueOnce([f3]).mockResolvedValue([])
		const { vm, wrapper, emitModal } = mountViewer([probeHandler()])

		await vm.open([f1, f2], f1, { canLoop: false, loadMore })
		await wrapper.vm.$nextTick()
		await flushPromises()
		expect(lastRender().files).toHaveLength(2)

		// Reaching the last file asks for more, and the appended file arrives
		// through the `files` prop. A handler never calls loadMore itself.
		await emitModal('next')
		await flushPromises()
		await wrapper.vm.$nextTick()

		expect(loadMore).toHaveBeenCalledTimes(1)
		expect(lastRender().files.map((file) => file.basename)).toEqual(['f1.jpg', 'f2.jpg', 'f3.jpg'])
	})
})

describe('what a handler emits', () => {
	it('is shown once it says it has loaded', async () => {
		renders.length = 0
		const f1 = makeFile({ mime: 'image/jpeg' })
		const { vm, wrapper } = mountViewer([probeHandler()])
		const spinner = () => wrapper.find('.nc-loading-icon-stub').exists()

		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()
		await flushPromises()
		expect(spinner()).toBe(true)

		emitFromProbe!('loaded')
		await wrapper.vm.$nextTick()

		expect(spinner()).toBe(false)
	})

	it('shows its message when it reports an error', async () => {
		renders.length = 0
		const f1 = makeFile({ mime: 'image/jpeg' })
		const { vm, wrapper, errorText } = mountViewer([probeHandler()])

		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()
		await flushPromises()

		emitFromProbe!('errored', new Error('this file is beyond me'))
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe('this file is beyond me')
	})
})

describe('a handler that misbehaves', () => {
	it('keeps swiping on when it reports nothing', async () => {
		renders.length = 0
		const f1 = makeFile({ mime: 'image/jpeg' })
		const { vm, wrapper, modalProps } = mountViewer([probeHandler()])

		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()
		await flushPromises()

		emitFromProbe!('update:canSwipe')
		await wrapper.vm.$nextTick()

		// Only an explicit false turns swiping off, so a handler emitting
		// nothing cannot leave the user stuck on one file
		expect(modalProps().disableSwipe).toBe(false)
	})

	it.each([
		['a string instead of an Error', 'disk on fire', 'disk on fire'],
		['nothing at all', undefined, 'An unknown error occurred while loading the file.'],
		['an Error with no message', new Error(''), 'An unknown error occurred while loading the file.'],
		['an object that is not an Error', { code: 500 }, 'An unknown error occurred while loading the file.'],
	])('shows something sensible when it reports %s', async (_name, reported, expected) => {
		renders.length = 0
		const f1 = makeFile({ mime: 'image/jpeg' })
		const { vm, wrapper, errorText } = mountViewer([probeHandler()])

		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()
		await flushPromises()

		emitFromProbe!('errored', reported)
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe(expected)
	})

	it('is not offered the editing action unless it says it can edit', async () => {
		renders.length = 0
		const f1 = makeFile({ mime: 'image/jpeg' })
		const { vm, wrapper } = mountViewer([probeHandler()])

		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()
		await flushPromises()

		// A handler without canEdit asking to edit is ignored rather than
		// putting the viewer into a mode it cannot leave
		emitFromProbe!('update:editing', true)
		await wrapper.vm.$nextTick()

		expect(lastRender().editing).toBe(false)
	})
})

describe('swiping away from a handler', () => {
	it('stops while the handler is being interacted with', async () => {
		renders.length = 0
		const f1 = makeFile({ basename: 'a.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'b.jpg', mime: 'image/jpeg' })
		const { vm, wrapper, modalProps } = mountViewer([probeHandler()])

		await vm.open([f1, f2], f1)
		await wrapper.vm.$nextTick()
		await flushPromises()
		expect(modalProps().disableSwipe).toBe(false)

		// What Images.vue emits once the image is zoomed, so dragging pans
		// instead of swiping to the next file
		emitFromProbe!('update:canSwipe', false)
		await wrapper.vm.$nextTick()
		expect(modalProps().disableSwipe).toBe(true)

		emitFromProbe!('update:canSwipe', true)
		await wrapper.vm.$nextTick()
		expect(modalProps().disableSwipe).toBe(false)
	})

	it('stops while editing, whatever the handler says', async () => {
		renders.length = 0
		const f1 = makeFile({ basename: 'a.jpg', mime: 'image/jpeg' })
		const { vm, wrapper, modalProps } = mountViewer([probeHandler({ canEdit: true })])

		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()
		await flushPromises()

		vm.setEditing(true)
		await wrapper.vm.$nextTick()

		expect(modalProps().disableSwipe).toBe(true)
	})
})
