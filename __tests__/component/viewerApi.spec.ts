/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('@nextcloud/event-bus')
vi.mock('../../lib/services/dav.ts', () => ({ fetchFolderContent: vi.fn(async () => []) }))
// Editing renders the image editor, which drags in canvas, webgl and a
// stylesheet node cannot parse. None of that is what these tests are about.
vi.mock('@nextcloud/image-editor', () => ({
	ImageEditor: defineComponent({
		name: 'LibImageEditor',
		emits: ['save', 'cancel', 'error'],
		template: '<div class="image-editor-stub" />',
	}),
}))

import { Folder, Permission, registerFileAction } from '@nextcloud/files'
import { fetchFolderContent } from '../../lib/services/dav.ts'
import { logger } from '../../lib/services/logger.ts'
import { makeFile, makeHandler } from '../factories.ts'
import { mountViewer } from './mountViewer.ts'

const NO_PLUGIN = 'There was no plugin available to open this file.'
const CANNOT_OPEN = 'We were not able to open the file.'

function imageHandler(overrides = {}) {
	return makeHandler({
		id: 'image',
		tagname: 'oca-viewer-image',
		enabled: (nodes) => nodes.every((n) => n.mime?.startsWith('image/')),
		...overrides,
	})
}

function makeFolder() {
	return new Folder({
		id: 99,
		source: 'https://cloud.example.com/remote.php/dav/files/admin/Photos',
		root: '/files/admin',
		owner: 'admin',
		permissions: Permission.ALL,
	})
}

afterEach(() => {
	document.body.innerHTML = ''
	vi.restoreAllMocks()
})

describe('open() with bad input', () => {
	it('reports when there is nothing to open', async () => {
		vi.spyOn(logger, 'error').mockImplementation(() => {})
		const { vm, wrapper, errorText } = mountViewer([imageHandler()])

		await vm.open([])
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe('No files were provided to open.')
	})

	it('reports when no handler takes the file', async () => {
		vi.spyOn(logger, 'error').mockImplementation(() => {})
		const { vm, wrapper, errorText, renderedTags } = mountViewer([imageHandler()])
		const zip = makeFile({ mime: 'application/zip' })

		await vm.open([zip], zip)
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe(NO_PLUGIN)
		expect(renderedTags()).toEqual([])
	})

	it('opens the first file when none is singled out', async () => {
		const { vm, wrapper, modalName } = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'first.jpg' })
		const f2 = makeFile({ basename: 'second.jpg' })

		await vm.open([f1, f2])
		await wrapper.vm.$nextTick()

		expect(modalName()).toBe('first.jpg')
	})

	it('adds the singled-out file to the list when the caller left it out', async () => {
		const { vm, wrapper, modalName, modalProps } = mountViewer([imageHandler()])
		const listed = makeFile({ basename: 'listed.jpg' })
		const opened = makeFile({ basename: 'opened.jpg' })

		await vm.open([listed], opened)
		await wrapper.vm.$nextTick()

		expect(modalName()).toBe('opened.jpg')
		// Two files to move between, so navigation is on
		expect(modalProps().hasNext).toBe(true)
	})

	it('shows the error again after a good open cleared it', async () => {
		vi.spyOn(logger, 'error').mockImplementation(() => {})
		const { vm, wrapper, errorText } = mountViewer([imageHandler()])
		const zip = makeFile({ mime: 'application/zip' })
		const img = makeFile()

		await vm.open([zip], zip)
		await wrapper.vm.$nextTick()
		expect(errorText()).toBe(NO_PLUGIN)

		await vm.open([img], img)
		await wrapper.vm.$nextTick()
		expect(errorText()).toBeUndefined()
	})
})

describe('openFolder()', () => {
	const folderContent = vi.mocked(fetchFolderContent)

	it('lists the folder and opens the requested file from it', async () => {
		const { vm, modalName, modalProps } = mountViewer([imageHandler()])
		const folder = makeFolder()
		const a = makeFile({ basename: 'a.jpg' })
		const b = makeFile({ basename: 'b.jpg' })
		folderContent.mockResolvedValueOnce([a, b, makeFile({ basename: 'notes.txt', mime: 'text/plain' })])

		await vm.openFolder(folder, b, { canLoop: false })
		await flushPromises()

		expect(folderContent).toHaveBeenCalledWith(folder)
		expect(modalName()).toBe('b.jpg')
		// a.jpg before it, notes.txt filtered out after it
		expect(modalProps().hasPrevious).toBe(true)
		expect(modalProps().hasNext).toBe(false)
	})

	it('opens the first viewable file when none is requested', async () => {
		const { vm, modalName } = mountViewer([imageHandler()])
		folderContent.mockResolvedValueOnce([makeFile({ basename: 'only.jpg' })])

		await vm.openFolder(makeFolder())
		await flushPromises()

		expect(modalName()).toBe('only.jpg')
	})

	it('refuses anything that is not a folder', async () => {
		vi.spyOn(logger, 'error').mockImplementation(() => {})
		const { vm, wrapper, errorText } = mountViewer([imageHandler()])

		await vm.openFolder(makeFile())
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe(CANNOT_OPEN)
		expect(folderContent).not.toHaveBeenCalled()
	})

	it('refuses an unknown handler id before listing anything', async () => {
		vi.spyOn(logger, 'error').mockImplementation(() => {})
		const { vm, wrapper, errorText } = mountViewer([imageHandler()])

		await vm.openFolder(makeFolder(), undefined, undefined, 'nope')
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe(CANNOT_OPEN)
		expect(folderContent).not.toHaveBeenCalled()
	})

	it('reports a listing that fails', async () => {
		const error = vi.spyOn(logger, 'error').mockImplementation(() => {})
		const { vm, wrapper, errorText } = mountViewer([imageHandler()])
		folderContent.mockRejectedValueOnce(new Error('403'))

		await vm.openFolder(makeFolder())
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe(CANNOT_OPEN)
		expect(error).toHaveBeenCalledWith('Failed to fetch folder contents', expect.objectContaining({ error: expect.any(Error) }))
	})
})

describe('compare() with bad input', () => {
	it('needs two files', async () => {
		vi.spyOn(logger, 'error').mockImplementation(() => {})
		const { vm, wrapper, errorText } = mountViewer([imageHandler()])

		await vm.compare(makeFile(), makeFolder())
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe(CANNOT_OPEN)
	})

	it('needs a handler for both sides', async () => {
		vi.spyOn(logger, 'error').mockImplementation(() => {})
		const { vm, wrapper, errorText } = mountViewer([imageHandler()])

		await vm.compare(makeFile(), makeFile({ mime: 'application/zip' }))
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe(NO_PLUGIN)
	})

	it('refuses an unknown handler id', async () => {
		vi.spyOn(logger, 'error').mockImplementation(() => {})
		const { vm, wrapper, errorText } = mountViewer([imageHandler()])

		await vm.compare(makeFile(), makeFile(), 'nope')
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe(CANNOT_OPEN)
	})

	it('uses the given handler for both sides', async () => {
		const other = makeHandler({ id: 'other', tagname: 'oca-viewer-other' })
		const { vm, wrapper, renderedTags } = mountViewer([imageHandler(), other])

		await vm.compare(makeFile(), makeFile(), 'other')
		await wrapper.vm.$nextTick()

		expect(renderedTags()).toEqual(['oca-viewer-other', 'oca-viewer-other'])
	})
})

describe('the editing option', () => {
	it('opens straight into editing for a handler that can edit a writable file', async () => {
		const { vm, modalProps } = mountViewer([imageHandler({ canEdit: true })])
		const file = makeFile()

		await vm.open([file], file, { editing: true })
		await flushPromises()

		// The slideshow pauses for as long as editing is on
		expect(modalProps().slideshowPaused).toBe(true)
	})

	it('is ignored when the handler cannot edit', async () => {
		const { vm, wrapper, modalProps } = mountViewer([imageHandler()])
		const file = makeFile()

		await vm.open([file], file, { editing: true })
		await wrapper.vm.$nextTick()

		expect(modalProps().slideshowPaused).toBe(false)
	})

	it('is ignored when the file is read-only', async () => {
		const { vm, wrapper, modalProps } = mountViewer([imageHandler({ canEdit: true })])
		const file = makeFile({ permissions: Permission.READ })

		await vm.open([file], file, { editing: true })
		await wrapper.vm.$nextTick()

		expect(modalProps().slideshowPaused).toBe(false)
	})

	it('tells the opener whenever editing changes, and once more on close', async () => {
		const onEditingChange = vi.fn()
		const { vm, wrapper } = mountViewer([imageHandler({ canEdit: true })])
		const file = makeFile()

		await vm.open([file], file, { onEditingChange })
		await wrapper.vm.$nextTick()
		vm.setEditing(true)
		await wrapper.vm.$nextTick()
		vm.close()
		await wrapper.vm.$nextTick()

		expect(onEditingChange.mock.calls).toEqual([[true], [false]])
	})
})

describe('the view and folder options', () => {
	it('are handed to the file actions shown in the viewer', async () => {
		const enabled = vi.fn(() => true)
		registerFileAction({
			id: 'context-probe',
			displayName: () => 'Probe',
			iconSvgInline: () => '<svg />',
			enabled,
			exec: async () => null,
		})
		const view = { id: 'files' } as never
		const folder = makeFolder()
		const { vm, wrapper } = mountViewer([imageHandler()])
		const file = makeFile()

		await vm.open([file], file, { view, folder })
		await wrapper.vm.$nextTick()

		expect(enabled).toHaveBeenCalledWith(expect.objectContaining({ nodes: [file], view, folder }))
	})
})
