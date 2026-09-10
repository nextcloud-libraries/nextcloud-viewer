/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { VueWrapper } from '@vue/test-utils'

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

vi.mock('@nextcloud/event-bus')
vi.mock('../../lib/services/dav.ts', () => ({ fetchFolderContent: vi.fn(async () => []) }))
// Editing renders the image editor, which drags in canvas, webgl and a
// stylesheet node cannot parse. None of that is what these tests are about.
vi.mock('@nextcloud/image-editor/style', () => ({}))
vi.mock('@nextcloud/image-editor', () => ({
	ImageEditor: defineComponent({
		name: 'LibImageEditor',
		emits: ['save', 'cancel', 'error'],
		template: '<div class="image-editor-stub" />',
	}),
}))

import { subscribe } from '@nextcloud/event-bus'
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

	it('drops the error of a failed open once the next one succeeds', async () => {
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

describe('open() with a forced handler', () => {
	// Both take every image, so the first one registered is what
	// getHandlerForFile answers with, whatever the opener asked for.
	const editor = () => imageHandler({ id: 'editor', tagname: 'oca-viewer-editor' })

	it('keeps the file list of the handler that was asked for', async () => {
		const { vm, wrapper, modalProps, renderedTags } = mountViewer([imageHandler(), editor()])
		const files = [makeFile({ basename: 'a.jpg' }), makeFile({ basename: 'b.jpg' })]

		await vm.open(files, files[0], undefined, 'editor')
		await wrapper.vm.$nextTick()

		expect(renderedTags()).toEqual(['oca-viewer-editor'])
		// The list belongs to the handler that shows it, so both files are in
		// it and there is somewhere to page to.
		expect(modalProps().hasNext).toBe(true)
	})

	it('stays on that handler while navigating', async () => {
		const { vm, wrapper, emitModal, modalName, renderedTags } = mountViewer([imageHandler(), editor()])
		const files = [makeFile({ basename: 'a.jpg' }), makeFile({ basename: 'b.jpg' })]

		await vm.open(files, files[0], undefined, 'editor')
		await wrapper.vm.$nextTick()
		await emitModal('next')

		expect(modalName()).toBe('b.jpg')
		expect(renderedTags()).toEqual(['oca-viewer-editor'])
	})

	it('hands a file it does not take to its group', async () => {
		const images = imageHandler({ group: 'media' })
		const videos = makeHandler({
			id: 'videos',
			tagname: 'oca-viewer-videos',
			group: 'media',
			enabled: (nodes) => nodes.every((n) => n.mime?.startsWith('video/')),
		})
		const { vm, wrapper, emitModal, renderedTags } = mountViewer([images, videos])
		const clip = makeFile({ basename: 'clip.mp4', mime: 'video/mp4' })
		const photo = makeFile({ basename: 'photo.jpg' })

		await vm.open([clip, photo], clip, undefined, 'videos')
		await wrapper.vm.$nextTick()
		expect(renderedTags()).toEqual(['oca-viewer-videos'])

		await emitModal('next')
		expect(renderedTags()).toEqual(['oca-viewer-image'])
	})

	it('forgets the forced handler once closed', async () => {
		const { vm, wrapper, emitModal, renderedTags } = mountViewer([imageHandler(), editor()])
		const file = makeFile({ basename: 'a.jpg' })

		await vm.open([file], file, undefined, 'editor')
		await wrapper.vm.$nextTick()
		await emitModal('close')

		await vm.open([file], file)
		await wrapper.vm.$nextTick()

		expect(renderedTags()).toEqual(['oca-viewer-image'])
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
		vi.spyOn(logger, 'error').mockImplementation(() => {})
		const { vm, wrapper, errorText } = mountViewer([imageHandler()])
		folderContent.mockRejectedValueOnce(new Error('403'))

		await vm.openFolder(makeFolder())
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe(CANNOT_OPEN)
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

	/**
	 * Get the handler the viewer subscribed for one of the files events.
	 *
	 * @param event - The event name
	 */
	function busHandler(event: string) {
		const call = vi.mocked(subscribe).mock.calls.find(([name]) => name === event)
		return call![1] as (node: unknown) => void
	}

	/**
	 * Open a writable image, edit it, and save. What comes back is the local
	 * source the viewer shows without going to the server for it.
	 */
	async function saveAnEdit() {
		const ctx = mountViewer([imageHandler({ canEdit: true })])
		const file = makeFile()

		await ctx.vm.open([file], file, { editing: true })
		// The editor is loaded on demand, so it is not there on the first tick
		const editor = () => ctx.wrapper.findComponent({ name: 'ImageEditor' })
		await vi.waitFor(() => expect(editor().exists()).toBe(true))
		editor().vm.$emit('saved', 'blob:edited')
		await flushPromises()

		const localSource = () => ctx.wrapper.find('oca-viewer-image').attributes('local-source')
		expect(localSource()).toBe('blob:edited')
		return { ...ctx, file, localSource }
	}

	it('shows a save of its own from the bytes it was handed', async () => {
		const { file, localSource, wrapper } = await saveAnEdit()

		// The editor announces the save it just made; the viewer is already
		// showing those bytes and refetching them is a request for nothing
		busHandler('files:node:updated')(file)
		await flushPromises()

		expect(localSource()).toBe('blob:edited')
		expect(wrapper.find('oca-viewer-image').exists()).toBe(true)
	})

	// The local bytes were only ever a shortcut around the viewer's own save.
	// A change from anywhere else is a different file to show, and waiting
	// for one that never comes is how an edited file stayed frozen.
	it('drops them when the file changes elsewhere', async () => {
		const { file, localSource } = await saveAnEdit()
		busHandler('files:node:updated')(file)
		await flushPromises()

		busHandler('files:node:updated')(file)
		await flushPromises()

		expect(localSource()).toBeUndefined()
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

describe('clicking beside the media', () => {
	it('closes the viewer', async () => {
		const onClose = vi.fn()
		const { vm, wrapper, modalExists } = mountViewer([imageHandler()])
		const file = makeFile()

		await vm.open([file], file, { onClose })
		await flushPromises()

		await wrapper.find('.modal-container__content').trigger('click')

		expect(onClose).toHaveBeenCalledTimes(1)
		expect(modalExists()).toBe(false)
	})

	it('does not close it for a click on the media itself', async () => {
		const onClose = vi.fn()
		const { vm, wrapper, modalExists } = mountViewer([imageHandler()])
		const file = makeFile()

		await vm.open([file], file, { onClose })
		await flushPromises()

		// The click lands on the handler element, and bubbles up through the content
		await wrapper.find('oca-viewer-image').trigger('click')

		expect(onClose).not.toHaveBeenCalled()
		expect(modalExists()).toBe(true)
	})
})

describe('the context menu over the media', () => {
	async function rightClick(file: ReturnType<typeof makeFile>) {
		const { vm, wrapper } = mountViewer([imageHandler()])
		await vm.open([file], file)
		await flushPromises()

		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
		wrapper.find('oca-viewer-image').element.dispatchEvent(event)
		return event.defaultPrevented
	}

	it('is left to the browser for a file that may be downloaded', async () => {
		expect(await rightClick(makeFile())).toBe(false)
	})

	it('is refused for a file whose share forbids downloading', async () => {
		const shareAttributes = JSON.stringify([{ scope: 'permissions', key: 'download', value: false }])
		expect(await rightClick(makeFile({ attributes: { shareAttributes } }))).toBe(true)
	})
})

describe('full screen', () => {
	// jsdom has no Fullscreen API: fake the two calls and the element they toggle
	let fullscreenElement: Element | null = null
	const requestFullscreen = vi.fn(async () => {
		fullscreenElement = document.documentElement
		document.dispatchEvent(new Event('fullscreenchange'))
	})
	const exitFullscreen = vi.fn(async () => {
		fullscreenElement = null
		document.dispatchEvent(new Event('fullscreenchange'))
	})

	beforeEach(() => {
		fullscreenElement = null
		Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement })
		document.documentElement.requestFullscreen = requestFullscreen
		document.exitFullscreen = exitFullscreen
	})

	const fullscreenButton = (wrapper: VueWrapper) => wrapper
		.findAll('.nc-action-button-stub')
		.find((button) => /full screen/i.test(button.text()))!

	it('puts the whole page full screen from the action, and offers the way back', async () => {
		const { vm, wrapper } = mountViewer([imageHandler()])
		const file = makeFile()
		await vm.open([file], file)
		await flushPromises()
		expect(fullscreenButton(wrapper).text()).toBe('Full screen')

		await fullscreenButton(wrapper).trigger('click')
		await flushPromises()

		expect(requestFullscreen).toHaveBeenCalledTimes(1)
		expect(fullscreenButton(wrapper).text()).toBe('Exit full screen')

		await fullscreenButton(wrapper).trigger('click')
		await flushPromises()

		expect(exitFullscreen).toHaveBeenCalledTimes(1)
		expect(fullscreenButton(wrapper).text()).toBe('Full screen')
	})

	it('follows the browser when the user leaves full screen with Escape', async () => {
		const { vm, wrapper } = mountViewer([imageHandler()])
		const file = makeFile()
		await vm.open([file], file)
		await flushPromises()
		await fullscreenButton(wrapper).trigger('click')
		await flushPromises()

		fullscreenElement = null
		document.dispatchEvent(new Event('fullscreenchange'))
		await wrapper.vm.$nextTick()

		expect(fullscreenButton(wrapper).text()).toBe('Full screen')
	})

	it('leaves full screen when the viewer closes', async () => {
		const { vm, wrapper } = mountViewer([imageHandler()])
		const file = makeFile()
		await vm.open([file], file)
		await flushPromises()
		await fullscreenButton(wrapper).trigger('click')
		await flushPromises()

		vm.close()
		await flushPromises()

		expect(exitFullscreen).toHaveBeenCalledTimes(1)
	})
})
