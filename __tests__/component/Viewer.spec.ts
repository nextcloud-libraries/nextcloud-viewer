/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { VueWrapper } from '@vue/test-utils'

import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// Mock the event bus BEFORE importing the component (shared manual mock).
vi.mock('@nextcloud/event-bus')
// Avoid the real DAV client being created on module import.
vi.mock('../../lib/services/dav.ts', () => ({ fetchFolderContent: vi.fn(async () => []) }))
// The real editor draws on a canvas, which the DOM here cannot do
vi.mock('@nextcloud/image-editor', async () => {
	const { defineComponent } = await import('vue')
	return {
		ImageEditor: defineComponent({ name: 'LibImageEditor', template: '<div class="image-editor-stub"><textarea /></div>' }),
	}
})

import { emit, subscribe, unsubscribe } from '@nextcloud/event-bus'
import { registerFileAction } from '@nextcloud/files'
import { restoreTitle } from '../../lib/utils/documentTitle.ts'
import { makeFile, makeHandler } from '../factories.ts'
import { mountViewer } from './mountViewer.ts'

function imageHandler() {
	return makeHandler({
		id: 'image',
		tagName: 'oca-viewer-image',
		group: 'media',
		enabled: (nodes) => nodes.every((n) => n.mime?.startsWith('image/')),
	})
}

afterEach(() => {
	document.body.innerHTML = ''
	document.body.className = ''
	// The title the viewer borrows is module state: give it back so it is
	// not still on loan in the next test
	restoreTitle()
})

describe('Viewer.open()', () => {
	it('activates the matching handler and shows the modal', async () => {
		const { vm, wrapper, modalHandlerId, modalName, modalProps } = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'a.jpg', mime: 'image/jpeg' })

		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()

		expect(modalHandlerId()).toBe('image')
		expect(modalName()).toBe('a.jpg')
		expect(modalProps().show).toBe(true)
	})

	it('titles the modal with the display name when the server gives one', async () => {
		const { vm, wrapper, modalName } = mountViewer([imageHandler()])
		// A version of a file is served under its version id but reads as a date
		const version = makeFile({ basename: '1737542400', mime: 'image/jpeg', displayname: '22 January 2025, 11:20:00' })

		await vm.open([version], version)
		await wrapper.vm.$nextTick()

		expect(modalName()).toBe('22 January 2025, 11:20:00')
	})

	it('filters currentFileList to files of the same handler group', async () => {
		const pdfHandler = makeHandler({
			id: 'pdf',
			tagName: 'oca-viewer-pdf',
			group: 'documents',
			enabled: (nodes) => nodes.every((n) => n.mime === 'application/pdf'),
		})
		const { vm, wrapper, modalName, modalProps, emitModal } = mountViewer([imageHandler(), pdfHandler])
		const img1 = makeFile({ basename: 'img1.jpg', mime: 'image/jpeg' })
		const img2 = makeFile({ basename: 'img2.jpg', mime: 'image/jpeg' })
		const doc = makeFile({ basename: 'doc.pdf', mime: 'application/pdf' })

		// Open the image; the pdf is a different group and must be filtered out.
		await vm.open([img1, img2, doc], img1, { canLoop: false })
		await wrapper.vm.$nextTick()

		expect(modalName()).toBe('img1.jpg')
		expect(modalProps().hasNext).toBe(true)

		await emitModal('next')
		expect(modalName()).toBe('img2.jpg')
		// At the end of the filtered [img1, img2] list, with canLoop=false → no next.
		expect(modalProps().hasNext).toBe(false)

		// The pdf, being of another group, is never reachable through navigation.
		await emitModal('next')
		expect(modalName()).toBe('img2.jpg')
	})

	it('shows an error when the explicit handlerId is not registered', async () => {
		const { vm, wrapper, errorText, modalProps, renderedTags } = mountViewer([imageHandler()])
		const f1 = makeFile({ mime: 'image/jpeg' })

		await vm.open([f1], f1, undefined, 'does-not-exist')
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe('There was no plugin available to open this file.')
		// No file got opened, but the modal is shown regardless: it is what
		// carries the error, and it hides its content while `show` is false.
		expect(renderedTags()).toEqual([])
		expect(modalProps().show).toBe(true)
	})

	it.each([
		['light', true],
		['dark', false],
		['default', false],
	] as const)('gives the modal a light backdrop only for a %s themed handler', async (theme, lightBackdrop) => {
		const handler = makeHandler({ id: theme, tagName: `oca-viewer-${theme}`, theme, enabled: () => true })
		const { vm, wrapper, modalProps } = mountViewer([handler])
		const f1 = makeFile()
		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()
		expect(modalProps().lightBackdrop).toBe(lightBackdrop)
	})
})

describe('Viewer navigation', () => {
	const setup = async (canLoop: boolean) => {
		const onNext = vi.fn()
		const onPrev = vi.fn()
		const onClose = vi.fn()
		const loadMore = vi.fn(async () => [])
		const ctx = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		const f3 = makeFile({ basename: 'f3.jpg', mime: 'image/jpeg' })
		await ctx.vm.open([f1, f2, f3], f1, { onNext, onPrev, onClose, canLoop, loadMore })
		await ctx.wrapper.vm.$nextTick()
		return { ...ctx, onNext, onPrev, onClose, loadMore, f1, f2, f3 }
	}

	it('next advances the current file and calls onNext with the new file', async () => {
		const { emitModal, modalName, onNext, f2 } = await setup(true)
		await emitModal('next')
		expect(modalName()).toBe('f2.jpg')
		expect(onNext).toHaveBeenCalledTimes(1)
		expect(onNext).toHaveBeenCalledWith(f2)
	})

	it('previous goes back and calls onPrev', async () => {
		const { emitModal, modalName, onPrev } = await setup(true)
		await emitModal('next')
		await emitModal('previous')
		expect(modalName()).toBe('f1.jpg')
		expect(onPrev).toHaveBeenCalledTimes(1)
	})

	it('close calls onClose and resets the viewer', async () => {
		const { emitModal, modalExists, onClose } = await setup(true)
		await emitModal('close')
		expect(onClose).toHaveBeenCalledTimes(1)
		// The modal is not rendered while closed, so it exposes no dialog.
		expect(modalExists()).toBe(false)
	})

	it('loops from last to first when canLoop is true', async () => {
		const { emitModal, modalName } = await setup(true)
		await emitModal('next') // f2
		await emitModal('next') // f3 (last)
		expect(modalName()).toBe('f3.jpg')
		await emitModal('next') // wraps to f1
		expect(modalName()).toBe('f1.jpg')
	})

	it('loops from first to last on previous when canLoop is true', async () => {
		const { emitModal, modalName } = await setup(true)
		await emitModal('previous')
		expect(modalName()).toBe('f3.jpg')
	})

	it('stops at the last item when canLoop is false', async () => {
		const { emitModal, modalName, modalProps } = await setup(false)
		await emitModal('next') // f2
		await emitModal('next') // f3 (last)
		expect(modalName()).toBe('f3.jpg')
		expect(modalProps().hasNext).toBe(false)
		await emitModal('next') // no-op
		expect(modalName()).toBe('f3.jpg')
	})

	it('stops at the first item on previous when canLoop is false', async () => {
		const { emitModal, modalName, modalProps } = await setup(false)
		expect(modalProps().hasPrevious).toBe(false)
		await emitModal('previous') // no-op
		expect(modalName()).toBe('f1.jpg')
	})
})

describe('Viewer goTo()', () => {
	const setup = async () => {
		const onNext = vi.fn()
		const onPrev = vi.fn()
		const ctx = mountViewer([imageHandler()])
		const f1 = makeFile({ id: 101, basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ id: 102, basename: 'f2.jpg', mime: 'image/jpeg' })
		const f3 = makeFile({ id: 103, basename: 'f3.jpg', mime: 'image/jpeg' })
		await ctx.vm.open([f1, f2, f3], f1, { onNext, onPrev })
		await ctx.wrapper.vm.$nextTick()
		return { ...ctx, onNext, onPrev, f1, f2, f3 }
	}

	it('shows the requested file without firing navigation callbacks', async () => {
		const { vm, wrapper, modalName, onNext, onPrev } = await setup()
		vm.goTo(103)
		await wrapper.vm.$nextTick()
		expect(modalName()).toBe('f3.jpg')
		// History-driven move: must not push new entries via onNext/onPrev.
		expect(onNext).not.toHaveBeenCalled()
		expect(onPrev).not.toHaveBeenCalled()
	})

	it('ignores an unknown file id', async () => {
		const { vm, wrapper, modalName } = await setup()
		vm.goTo(999)
		await wrapper.vm.$nextTick()
		expect(modalName()).toBe('f1.jpg')
	})
})

describe('Viewer delete handling', () => {
	/**
	 * Get the files:node:deleted handler the viewer subscribed on mount.
	 */
	const deletedHandler = () => {
		const call = vi.mocked(subscribe).mock.calls.find((c) => c[0] === 'files:node:deleted')
		return call![1] as (node: unknown) => void
	}

	const setup = async () => {
		const ctx = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		const f3 = makeFile({ basename: 'f3.jpg', mime: 'image/jpeg' })
		await ctx.vm.open([f1, f2, f3], f1)
		await ctx.wrapper.vm.$nextTick()
		return { ...ctx, f1, f2, f3 }
	}

	it('advances to the next file when the current one is deleted', async () => {
		const { wrapper, modalName, f1 } = await setup()
		deletedHandler()(f1)
		await wrapper.vm.$nextTick()
		expect(modalName()).toBe('f2.jpg')
	})

	it('falls back to the previous file when the last one is deleted', async () => {
		const { vm, wrapper, modalName, f3 } = await setup()
		await vm.goTo(f3.fileid!)
		await wrapper.vm.$nextTick()
		expect(modalName()).toBe('f3.jpg')

		deletedHandler()(f3)
		await wrapper.vm.$nextTick()
		expect(modalName()).toBe('f2.jpg')
	})

	it('closes the viewer when the last remaining file is deleted', async () => {
		const ctx = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'only.jpg', mime: 'image/jpeg' })
		await ctx.vm.open([f1], f1)
		await ctx.wrapper.vm.$nextTick()

		const call = vi.mocked(subscribe).mock.calls.find((c) => c[0] === 'files:node:deleted')
		;(call![1] as (node: unknown) => void)(f1)
		await ctx.wrapper.vm.$nextTick()
		expect(ctx.modalExists()).toBe(false)
	})

	// The Files app takes a deleted file out of its URL, and puts the one
	// shown back in from these, as for any move to another file
	it('tells the opener which file it moved on to', async () => {
		const ctx = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		const f3 = makeFile({ basename: 'f3.jpg', mime: 'image/jpeg' })
		const onNext = vi.fn()
		const onPrev = vi.fn()
		await ctx.vm.open([f1, f2, f3], f2, { onNext, onPrev })
		await ctx.wrapper.vm.$nextTick()

		deletedHandler()(f2)
		await ctx.wrapper.vm.$nextTick()
		expect(onNext).toHaveBeenCalledWith(f3)

		// The last one gone, it falls back on the one before
		deletedHandler()(f3)
		await ctx.wrapper.vm.$nextTick()
		expect(onPrev).toHaveBeenCalledWith(f1)
	})

	it('ignores deletion of a file not in the viewer list', async () => {
		const { wrapper, modalName } = await setup()
		deletedHandler()(makeFile({ id: 9999, basename: 'other.jpg' }))
		await wrapper.vm.$nextTick()
		expect(modalName()).toBe('f1.jpg')
	})
})

describe('Viewer action submenu', () => {
	const view = { id: 'files' } as never
	const folder = { path: '/' } as never
	const childExec = vi.fn()

	beforeAll(() => {
		// Register a parent action with a child (same shape as e.g. "Set reminder").
		registerFileAction({
			id: 'test-menu',
			displayName: () => 'Test menu',
			iconSvgInline: () => '<svg />',
			enabled: () => true,
			exec: async () => null,
		})
		registerFileAction({
			id: 'test-child',
			parent: 'test-menu',
			displayName: () => 'Child action',
			iconSvgInline: () => '<svg />',
			enabled: () => true,
			exec: childExec,
		})
	})

	it('opens the submenu and runs a child action', async () => {
		const { wrapper, vm } = mountViewer([imageHandler()])
		const f1 = makeFile({ mime: 'image/jpeg' })
		await vm.open([f1], f1, { view, folder })
		await wrapper.vm.$nextTick()

		const buttons = () => wrapper.findAll('.nc-action-button-stub')
		// Parent shown, child hidden until the submenu is opened.
		expect(buttons().find((b) => b.text().includes('Test menu'))).toBeTruthy()
		expect(wrapper.text()).not.toContain('Child action')

		await buttons().find((b) => b.text().includes('Test menu'))!.trigger('click')
		expect(wrapper.text()).toContain('Child action')

		await buttons().find((b) => b.text().includes('Child action'))!.trigger('click')
		expect(childExec).toHaveBeenCalled()
	})
})

describe('Viewer sidebar', () => {
	const sidebarButton = (wrapper: ReturnType<typeof mountViewer>['wrapper']) => wrapper.findAll('.nc-action-button-stub').find((button) => button.text().includes('Open sidebar'))

	it('offers the sidebar for an ordinary file', async () => {
		const { vm, wrapper } = mountViewer([imageHandler()])
		const f1 = makeFile({ mime: 'image/jpeg' })

		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()

		expect(sidebarButton(wrapper)).toBeTruthy()
	})

	it('does not offer it for a file the sidebar cannot resolve', async () => {
		const { vm, wrapper } = mountViewer([imageHandler()])
		const version = makeFile({ mime: 'image/jpeg' })

		await vm.open([version], version, { enableSidebar: false })
		await wrapper.vm.$nextTick()

		expect(sidebarButton(wrapper)).toBeUndefined()
	})
})

describe('Viewer loadMore', () => {
	it('appends files returned by loadMore when reaching the last item', async () => {
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		const f4 = makeFile({ basename: 'f4.jpg', mime: 'image/jpeg' })
		const loadMore = vi.fn()
			.mockResolvedValueOnce([f4])
			.mockResolvedValue([])

		const { vm, wrapper, emitModal, modalName } = mountViewer([imageHandler()])
		await vm.open([f1, f2], f1, { canLoop: false, loadMore })
		await wrapper.vm.$nextTick()

		await emitModal('next') // onto f2 (last) → triggers loadMore
		await flushPromises()
		expect(loadMore).toHaveBeenCalledTimes(1)
		expect(modalName()).toBe('f2.jpg')

		// The appended f4 is now navigable.
		await emitModal('next')
		await flushPromises()
		expect(modalName()).toBe('f4.jpg')
	})
})

describe('Viewer preload', () => {
	it('preloads both neighbours of the opened file, once it has loaded', async () => {
		const preload = vi.fn(async () => {})
		const handler = makeHandler({
			id: 'image',
			tagName: 'oca-viewer-image',
			group: 'media',
			preload,
			enabled: (nodes) => nodes.every((n) => n.mime?.startsWith('image/')),
		})
		const { vm, wrapper } = mountViewer([handler])
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		const f3 = makeFile({ basename: 'f3.jpg', mime: 'image/jpeg' })

		// Open in the middle so both neighbours exist.
		await vm.open([f1, f2, f3], f2)
		await wrapper.vm.$nextTick()

		// The file shown has its requests to itself first
		expect(preload).not.toHaveBeenCalled()
		wrapper.find('oca-viewer-image').element.dispatchEvent(new CustomEvent('loaded'))
		await wrapper.vm.$nextTick()

		expect(preload).toHaveBeenCalledTimes(2)
		// With the space they will be shown in, which a preview's size depends on
		expect(preload).toHaveBeenCalledWith(f1, { width: expect.any(Number), height: expect.any(Number) })
		expect(preload).toHaveBeenCalledWith(f3, { width: expect.any(Number), height: expect.any(Number) })
	})

	it('still opens the file when a neighbour preload throws instead of rejecting', async () => {
		// `preload` is documented to return a promise; a handler that throws
		// synchronously (or returns nothing) is a bug in that handler, not a
		// reason for the file the user clicked to never show up
		const handler = makeHandler({
			id: 'image',
			tagName: 'oca-viewer-image',
			preload: (() => {
				throw new Error('boom')
			}) as never,
		})
		const { vm, modalHandlerId } = mountViewer([handler])
		const f1 = makeFile()
		const f2 = makeFile()

		await expect(vm.open([f1, f2], f1)).resolves.toBeUndefined()
		expect(modalHandlerId()).toBe('image')
	})
})

describe('Viewer compare()', () => {
	it('enters comparison mode with navigation disabled', async () => {
		const { vm, wrapper, modalName, modalProps, modalHandlerId } = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'left.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'right.jpg', mime: 'image/jpeg' })

		await vm.compare(f1, f2)
		await wrapper.vm.$nextTick()

		expect(modalName()).toBe('Comparing left.jpg and right.jpg')
		expect(modalHandlerId()).toBe('image')
		// Comparison has no navigation.
		expect(modalProps().hasNext).toBe(false)
		expect(modalProps().hasPrevious).toBe(false)
	})

	it('resets comparison state when a normal file is opened afterwards', async () => {
		const { vm, wrapper, modalName } = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'left.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'right.jpg', mime: 'image/jpeg' })

		await vm.compare(f1, f2)
		await wrapper.vm.$nextTick()
		expect(modalName()).toContain('Comparing')

		const f3 = makeFile({ basename: 'single.jpg', mime: 'image/jpeg' })
		await vm.open([f3], f3)
		await wrapper.vm.$nextTick()

		// Comparison title gone → no comparison leak.
		expect(modalName()).toBe('single.jpg')
		expect(modalName()).not.toContain('Comparing')
	})
})

describe('Viewer sidebar', () => {
	// The whole node: the Files app looks it up by its source, and fetches it
	// by its path when it is not in its store
	it('emits viewer:sidebar:open with the current file when the action is clicked', async () => {
		const { vm, wrapper } = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'a.jpg', mime: 'image/jpeg' })
		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()

		// By its label rather than by position: the actions around it change
		const sidebar = wrapper.findAll('.nc-action-button-stub')
			.find((button) => button.text().includes('Open sidebar'))
		await sidebar!.trigger('click')

		expect(emit).toHaveBeenCalledWith('viewer:sidebar:open', f1)
	})

	/**
	 * Get the handler the viewer subscribed for a files:sidebar event.
	 *
	 * @param event - The event name
	 */
	const sidebarHandler = (event: string) => {
		const call = vi.mocked(subscribe).mock.calls.find((c) => c[0] === event)
		return call![1] as () => void
	}

	it('expands the sidebar to full height only while the viewer is open', async () => {
		const { vm, wrapper } = mountViewer([imageHandler()])

		// Sidebar opened from the files list (viewer closed) must not touch the header.
		sidebarHandler('files:sidebar:opened')()
		expect(document.body.classList.contains('viewer--sidebar-fullscreen')).toBe(false)

		// With the viewer open, opening the sidebar hides the header.
		await vm.open([makeFile({ mime: 'image/jpeg' })], makeFile({ mime: 'image/jpeg' }))
		await wrapper.vm.$nextTick()
		sidebarHandler('files:sidebar:opened')()
		expect(document.body.classList.contains('viewer--sidebar-fullscreen')).toBe(true)

		// Closing the sidebar restores the header.
		sidebarHandler('files:sidebar:closed')()
		expect(document.body.classList.contains('viewer--sidebar-fullscreen')).toBe(false)
	})

	it('restores the header when the viewer closes with the sidebar open', async () => {
		const { vm, wrapper, emitModal } = mountViewer([imageHandler()])
		await vm.open([makeFile({ mime: 'image/jpeg' })], makeFile({ mime: 'image/jpeg' }))
		await wrapper.vm.$nextTick()
		sidebarHandler('files:sidebar:opened')()
		expect(document.body.classList.contains('viewer--sidebar-fullscreen')).toBe(true)

		await emitModal('close')
		expect(document.body.classList.contains('viewer--sidebar-fullscreen')).toBe(false)
	})

	it('unsubscribes from the files:sidebar events on unmount', () => {
		const { wrapper } = mountViewer([imageHandler()])
		wrapper.unmount()

		expect(unsubscribe).toHaveBeenCalledWith('files:sidebar:opened', expect.any(Function))
		expect(unsubscribe).toHaveBeenCalledWith('files:sidebar:closed', expect.any(Function))
	})

	/**
	 * Put a sidebar in the page, at the given distance from the left.
	 *
	 * @param left - Where the sidebar begins
	 */
	function addSidebar(left: number): HTMLElement {
		const sidebar = document.createElement('aside')
		sidebar.className = 'app-sidebar'
		sidebar.getBoundingClientRect = () => ({ left } as DOMRect)
		document.body.appendChild(sidebar)
		return sidebar
	}

	it('ends the viewer where the sidebar begins', async () => {
		addSidebar(700)
		const { vm, wrapper, modalStyle } = mountViewer([imageHandler()])
		const file = makeFile({ mime: 'image/jpeg' })
		await vm.open([file], file)
		await wrapper.vm.$nextTick()

		sidebarHandler('files:sidebar:opened')()
		await wrapper.vm.$nextTick()

		expect(modalStyle()).toBe('width: 700px;')
	})

	// The sidebar is resizable by hand, and the measurement it was opened
	// with is only right until someone drags it
	it('follows a sidebar that is resized', async () => {
		const sidebar = addSidebar(700)
		const { vm, wrapper, modalStyle, resized, observed } = mountViewer([imageHandler()])
		const file = makeFile({ mime: 'image/jpeg' })
		await vm.open([file], file)
		await wrapper.vm.$nextTick()
		sidebarHandler('files:sidebar:opened')()
		await wrapper.vm.$nextTick()

		// Dragged wider: it now begins further left
		sidebar.getBoundingClientRect = () => ({ left: 500 } as DOMRect)
		await resized()

		expect(modalStyle()).toBe('width: 500px;')
		expect(observed()).toContain(sidebar)
	})

	// The Files app only announces its sidebar when it opens: open before
	// the viewer, or restored from the URL with it, it is never announced
	it('makes room for a sidebar already open, and has it show the file', async () => {
		addSidebar(700)
		const { vm, modalStyle } = mountViewer([imageHandler()])
		const file = makeFile({ mime: 'image/jpeg' })

		await vm.open([file], file)
		await flushPromises()

		expect(modalStyle()).toContain('width: 700px')
		expect(document.body.classList.contains('viewer--sidebar-fullscreen')).toBe(true)
		expect(emit).toHaveBeenCalledWith('viewer:sidebar:open', file)
	})

	it('has an open sidebar follow the file shown', async () => {
		addSidebar(700)
		const { vm, emitModal } = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		await vm.open([f1, f2], f1)
		await flushPromises()

		await emitModal('next')
		await flushPromises()

		expect(emit).toHaveBeenLastCalledWith('viewer:sidebar:open', f2)
	})

	it('leaves a closed sidebar closed', async () => {
		const sidebar = addSidebar(700)
		sidebar.style.display = 'none'
		const { vm, modalStyle } = mountViewer([imageHandler()])
		const file = makeFile({ mime: 'image/jpeg' })

		await vm.open([file], file)
		await flushPromises()

		expect(modalStyle() ?? '').not.toContain('width')
		expect(document.body.classList.contains('viewer--sidebar-fullscreen')).toBe(false)
		expect(emit).not.toHaveBeenCalledWith('viewer:sidebar:open', expect.anything())
	})

	it('makes room for an open sidebar it may not drive, without driving it', async () => {
		addSidebar(700)
		const { vm, modalStyle } = mountViewer([imageHandler()])
		const file = makeFile({ mime: 'image/jpeg' })

		await vm.open([file], file, { enableSidebar: false })
		await flushPromises()

		expect(modalStyle()).toContain('width: 700px')
		expect(emit).not.toHaveBeenCalledWith('viewer:sidebar:open', expect.anything())
	})

	it('gives the sidebar back its place on the page once closed', async () => {
		addSidebar(700)
		const { vm } = mountViewer([imageHandler()])
		const file = makeFile({ mime: 'image/jpeg' })
		await vm.open([file], file)
		await flushPromises()

		vm.close()
		await flushPromises()

		expect(document.body.classList.contains('viewer--sidebar-fullscreen')).toBe(false)
	})

	it('stops watching the sidebar once it is closed', async () => {
		const sidebar = addSidebar(700)
		const { vm, wrapper, modalStyle, unobserved } = mountViewer([imageHandler()])
		const file = makeFile({ mime: 'image/jpeg' })
		await vm.open([file], file)
		await wrapper.vm.$nextTick()
		sidebarHandler('files:sidebar:opened')()
		sidebar.style.display = 'none'
		sidebarHandler('files:sidebar:closed')()
		await wrapper.vm.$nextTick()

		expect(unobserved()).toContain(sidebar)
		expect(modalStyle() ?? '').not.toContain('width')
	})
})

describe('the page title', () => {
	it('is given back when the viewer is torn down while open', async () => {
		document.title = 'Files - Nextcloud'
		const { vm, wrapper } = mountViewer([imageHandler()])
		const file = makeFile({ basename: 'a.jpg', mime: 'image/jpeg' })

		await vm.open([file], file)
		await wrapper.vm.$nextTick()
		expect(document.title).toContain('a.jpg')

		// Closing is not the only way to stop showing a file: the app hosting
		// the viewer can be torn down with one still open
		wrapper.unmount()

		expect(document.title).toBe('Files - Nextcloud')
	})
})

describe('Viewer loading gate', () => {
	// Regression guard: the handler custom-element must stay mounted while the
	// spinner is shown (only hidden via v-show), otherwise it could never load
	// and emit `loaded`, deadlocking the viewer on the spinner forever.
	it('mounts the handler element even while still loading', async () => {
		const { vm, wrapper, renderedTags } = mountViewer([imageHandler()])
		const f1 = makeFile({ mime: 'image/jpeg' })
		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()
		expect(renderedTags()).toContain('oca-viewer-image')
	})

	// Regression guard: the Files app opens the same file more than once —
	// clicking it, and again as the sidebar opens. The handler keeps the file
	// it already has and never says it loaded a second time, so treating that
	// as a fresh load left the spinner up forever.
	it('does not go back to loading when the same file is opened again', async () => {
		const { vm, wrapper } = mountViewer([imageHandler()])
		const f1 = makeFile({ mime: 'image/jpeg' })
		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()

		// The handler reports it has loaded
		wrapper.find('oca-viewer-image').element.dispatchEvent(new CustomEvent('loaded'))
		await wrapper.vm.$nextTick()
		expect(wrapper.find('.viewer__loading').exists()).toBe(false)

		await vm.open([f1], f1)
		await wrapper.vm.$nextTick()
		expect(wrapper.find('.viewer__loading').exists()).toBe(false)
	})

	it('goes back to loading when a different file is opened', async () => {
		const { vm, wrapper } = mountViewer([imageHandler()])
		const f1 = makeFile({ mime: 'image/jpeg' })
		const f2 = makeFile({ mime: 'image/jpeg' })
		await vm.open([f1, f2], f1)
		await wrapper.vm.$nextTick()
		wrapper.find('oca-viewer-image').element.dispatchEvent(new CustomEvent('loaded'))
		await wrapper.vm.$nextTick()

		await vm.open([f1, f2], f2)
		await wrapper.vm.$nextTick()
		expect(wrapper.find('.viewer__loading').exists()).toBe(true)
	})

	it('mounts both handler elements in comparison mode', async () => {
		const { vm, wrapper, renderedTags } = mountViewer([imageHandler()])
		const f1 = makeFile({ mime: 'image/jpeg' })
		const f2 = makeFile({ mime: 'image/jpeg' })
		await vm.compare(f1, f2)
		await wrapper.vm.$nextTick()
		expect(renderedTags().filter((t) => t === 'oca-viewer-image')).toHaveLength(2)
	})
})

describe('opening over a viewer that is still open', () => {
	function pdfHandler() {
		return makeHandler({
			id: 'pdf',
			tagName: 'oca-viewer-pdf',
			enabled: (nodes) => nodes.every((n) => n.mime === 'application/pdf'),
		})
	}

	function officeHandler() {
		return makeHandler({ id: 'office', tagName: 'oca-viewer-office', enabled: () => false })
	}

	it('still tells the first opener when a handler reopens without options', async () => {
		// A handler passing its file to another one reopens it with nothing
		// of its own, and the Files app still has to clean its URL on close
		const onClose = vi.fn()
		const { vm, wrapper, modalHandlerId } = mountViewer([pdfHandler(), officeHandler()])
		const doc = makeFile({ mime: 'application/pdf' })
		await vm.open([doc], doc, { onClose })
		await vm.open([doc], doc, undefined, 'office')
		await wrapper.vm.$nextTick()

		expect(modalHandlerId()).toBe('office')
		expect(onClose).not.toHaveBeenCalled()

		vm.close()
		expect(onClose).toHaveBeenCalledOnce()
	})

	it('calls an onClose passed again only once', async () => {
		// The Files app opens the same file again as the sidebar opens
		const onClose = vi.fn()
		const { vm } = mountViewer([pdfHandler()])
		const doc = makeFile({ mime: 'application/pdf' })
		await vm.open([doc], doc, { onClose })
		await vm.open([doc], doc, { onClose })

		vm.close()
		expect(onClose).toHaveBeenCalledOnce()
	})

	it('tells both openers, the first one too', async () => {
		const first = vi.fn()
		const second = vi.fn()
		const { vm } = mountViewer([pdfHandler()])
		const doc = makeFile({ mime: 'application/pdf' })
		await vm.open([doc], doc, { onClose: first })
		await vm.open([doc], doc, { onClose: second })

		vm.close()
		expect(first).toHaveBeenCalledOnce()
		expect(second).toHaveBeenCalledOnce()
	})

	it('tells the others when one of them throws', async () => {
		const throwing = vi.fn(() => {
			throw new Error('nope')
		})
		const after = vi.fn()
		const { vm } = mountViewer([pdfHandler()])
		const doc = makeFile({ mime: 'application/pdf' })
		await vm.open([doc], doc, { onClose: throwing })
		await vm.open([doc], doc, { onClose: after })

		vm.close()
		expect(after).toHaveBeenCalledOnce()
	})

	it('does not bring back the onClose of a viewer already closed', async () => {
		const onClose = vi.fn()
		const { vm } = mountViewer([pdfHandler()])
		const doc = makeFile({ mime: 'application/pdf' })
		await vm.open([doc], doc, { onClose })
		vm.close()
		await vm.open([doc], doc)
		vm.close()

		expect(onClose).toHaveBeenCalledOnce()
	})
})

describe('feedback while the file loads', () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it('says it is still loading once a load has taken a while', async () => {
		vi.useFakeTimers()
		const { vm, wrapper } = mountViewer([imageHandler()])
		const file = makeFile({ mime: 'image/jpeg' })
		await vm.open([file], file)
		await wrapper.vm.$nextTick()
		const hint = () => wrapper.find('.viewer__loading-hint').text()

		expect(hint()).toBe('')
		await vi.advanceTimersByTimeAsync(4000)
		expect(hint()).toBe('')
		await vi.advanceTimersByTimeAsync(1500)
		expect(hint()).toBe('Still loading…')

		wrapper.find('oca-viewer-image').element.dispatchEvent(new CustomEvent('loaded'))
		await wrapper.vm.$nextTick()
		expect(wrapper.find('.viewer__loading').exists()).toBe(false)
	})

	it('starts over for the next file', async () => {
		vi.useFakeTimers()
		const { vm, wrapper } = mountViewer([imageHandler()])
		const first = makeFile({ mime: 'image/jpeg' })
		const second = makeFile({ mime: 'image/jpeg' })
		await vm.open([first, second], first)
		await wrapper.vm.$nextTick()
		await vi.advanceTimersByTimeAsync(6000)
		wrapper.find('oca-viewer-image').element.dispatchEvent(new CustomEvent('loaded'))
		await wrapper.vm.$nextTick()

		await vm.open([first, second], second)
		await wrapper.vm.$nextTick()

		expect(wrapper.find('.viewer__loading-hint').text()).toBe('')
	})
})

describe('a file that failed to show', () => {
	it('can be tried again without closing the viewer', async () => {
		const { vm, wrapper, errorText, renderedTags } = mountViewer([imageHandler()])
		const file = makeFile({ mime: 'image/jpeg' })
		await vm.open([file], file)
		await wrapper.vm.$nextTick()
		const before = wrapper.find('oca-viewer-image').element
		before.dispatchEvent(new CustomEvent('errored', { detail: [new Error('decoder gave up')] }))
		await wrapper.vm.$nextTick()
		expect(errorText()).toBe('decoder gave up')

		await wrapper.findAll('button').find((button) => button.text() === 'Try again')!.trigger('click')
		await wrapper.vm.$nextTick()

		expect(errorText()).toBeUndefined()
		expect(wrapper.find('.viewer__loading').exists()).toBe(true)
		// A fresh element, so the handler starts over rather than staying broken
		expect(renderedTags()).toContain('oca-viewer-image')
		expect(wrapper.find('oca-viewer-image').element).not.toBe(before)
	})
})

describe('rotating and editing', () => {
	function editableImage() {
		return makeHandler({ ...imageHandler(), canEdit: true })
	}

	const offered = (wrapper: VueWrapper) => wrapper.findAll('.nc-action-button-stub')
		.map((button) => button.text())
		.filter((label) => label === 'Rotate left' || label === 'Edit')

	it('are offered once the file is shown', async () => {
		const { vm, wrapper } = mountViewer([editableImage()])
		const file = makeFile({ mime: 'image/jpeg' })
		await vm.open([file], file)
		await wrapper.vm.$nextTick()

		expect(offered(wrapper)).toEqual([])

		wrapper.find('oca-viewer-image').element.dispatchEvent(new CustomEvent('loaded'))
		await wrapper.vm.$nextTick()

		expect(offered(wrapper)).toEqual(['Rotate left', 'Edit'])
	})

	// The editor is drawn over the modal, outside it, and the modal keeps the
	// focus inside itself and what it is told about: typing into the editor's
	// text field went to the modal's slideshow button (nextcloud/viewer#3335)
	it('lets the editor have the focus while it is open', async () => {
		const { vm, wrapper, modalProps } = mountViewer([editableImage()])
		const file = makeFile({ mime: 'image/jpeg' })
		await vm.open([file], file)
		await wrapper.vm.$nextTick()
		wrapper.find('oca-viewer-image').element.dispatchEvent(new CustomEvent('loaded'))

		vm.setEditing(true)
		// The editor is a chunk of its own, loaded on first use
		const editor = await vi.waitFor(() => {
			const element = document.querySelector('.image-editor-stub')
			expect(element).not.toBeNull()
			return element
		})
		expect(modalProps().additionalTrapElements).toEqual([editor])

		// Beside a sidebar already trusted with it
		const sidebar = document.createElement('aside')
		sidebar.className = 'app-sidebar'
		document.body.append(sidebar)
		const opened = vi.mocked(subscribe).mock.calls.findLast(([event]) => event === 'files:sidebar:opened')![1] as () => void
		opened()
		await wrapper.vm.$nextTick()
		expect(modalProps().additionalTrapElements).toEqual([sidebar, editor])

		vm.setEditing(false)
		await flushPromises()
		expect(modalProps().additionalTrapElements).toEqual([sidebar])
	})

	it('are not offered for a file that failed to show', async () => {
		const { vm, wrapper, errorText } = mountViewer([editableImage()])
		const file = makeFile({ mime: 'image/jpeg' })
		await vm.open([file], file)
		await wrapper.vm.$nextTick()
		wrapper.find('oca-viewer-image').element
			.dispatchEvent(new CustomEvent('errored', { detail: [new Error('decoder gave up')] }))
		await wrapper.vm.$nextTick()

		expect(errorText()).toBe('decoder gave up')
		expect(offered(wrapper)).toEqual([])
	})
})

describe('what the image editor is offered on', () => {
	function editableImage() {
		return makeHandler({ ...imageHandler(), canEdit: true })
	}

	/**
	 * Open a file and let it show, then say whether Edit is offered.
	 *
	 * @param file - The file to open
	 */
	async function offersEditOn(file: ReturnType<typeof makeFile>) {
		const { vm, wrapper } = mountViewer([editableImage()])
		await vm.open([file], file)
		await wrapper.vm.$nextTick()
		wrapper.find('oca-viewer-image').element.dispatchEvent(new CustomEvent('loaded'))
		await wrapper.vm.$nextTick()
		return wrapper.findAll('.nc-action-button-stub').some((button) => button.text() === 'Edit')
	}

	afterEach(() => {
		delete (window as { _nc_initial_state?: unknown })._nc_initial_state
		Object.defineProperty(document.documentElement, 'clientWidth', { value: 1280, configurable: true })
		window.dispatchEvent(new Event('resize'))
	})

	it.each(['image/jpeg', 'image/png', 'image/webp'])('is %s, which it writes back as it came', async (mime) => {
		expect(await offersEditOn(makeFile({ mime }))).toBe(true)
	})

	// Saved as PNG under the old name: a flattened animation, or PNG bytes
	// in a file that says it is something else. HEIC is not even readable.
	it.each(['image/gif', 'image/svg+xml', 'image/bmp', 'image/avif', 'image/heic'])('is not %s, which it would rewrite as PNG', async (mime) => {
		expect(await offersEditOn(makeFile({ mime }))).toBe(false)
	})

	it('is not a file from a share that forbids downloading', async () => {
		const file = makeFile({
			mime: 'image/jpeg',
			attributes: { 'share-attributes': JSON.stringify([{ scope: 'permissions', key: 'download', value: false }]) },
		})
		expect(await offersEditOn(file)).toBe(false)
	})

	it('is not a file on a phone, where the editor does not fit', async () => {
		Object.defineProperty(document.documentElement, 'clientWidth', { value: 400, configurable: true })
		window.dispatchEvent(new Event('resize'))
		expect(await offersEditOn(makeFile({ mime: 'image/jpeg' }))).toBe(false)
	})

	it('is nothing where the admin turned off features that are not accessible', async () => {
		(window as { _nc_initial_state?: Map<string, unknown> })._nc_initial_state = new Map([
			['#initial-state-core-config', { 'enable_non-accessible_features': false }],
		])
		expect(await offersEditOn(makeFile({ mime: 'image/jpeg' }))).toBe(false)
	})

	it('is not a pair of files being compared, and neither is a turn', async () => {
		const { vm, wrapper } = mountViewer([editableImage()])
		const before = makeFile({ basename: 'before.jpg', mime: 'image/jpeg' })
		const after = makeFile({ basename: 'after.jpg', mime: 'image/jpeg' })
		await vm.compare(before, after)
		await wrapper.vm.$nextTick()
		for (const element of wrapper.findAll('oca-viewer-image')) {
			element.element.dispatchEvent(new CustomEvent('loaded'))
		}
		await wrapper.vm.$nextTick()

		const labels = wrapper.findAll('.nc-action-button-stub').map((button) => button.text())
		expect(labels).not.toContain('Edit')
		expect(labels).not.toContain('Rotate left')
	})
})

describe('versions of one file', () => {
	it('shows the current file again after one of its versions', async () => {
		const { vm, wrapper } = mountViewer([imageHandler()])
		const current = makeFile({ basename: 'a.jpg', mime: 'image/jpeg' })
		// Every version of a file shares its id, and only its source differs
		const version = makeFile({ id: current.fileid, basename: '1737542400', mime: 'image/jpeg' })
		const element = () => wrapper.find('oca-viewer-image')
		const loaded = async () => {
			element().element.dispatchEvent(new CustomEvent('loaded'))
			await wrapper.vm.$nextTick()
		}

		await vm.open([current], current)
		await wrapper.vm.$nextTick()
		await loaded()
		await vm.open([version], version)
		await wrapper.vm.$nextTick()
		const shownVersion = element().element
		await loaded()

		await vm.open([current], current)
		await wrapper.vm.$nextTick()

		// A fresh element for the current file, loading it, rather than the
		// one still showing the version
		expect(element().element).not.toBe(shownVersion)
		expect(wrapper.find('.viewer__loading').exists()).toBe(true)
	})
})

describe('loading more files', () => {
	it('asks for more when opened on the last file, and goes on to them', async () => {
		const { vm, wrapper, modalName, emitModal } = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		const f3 = makeFile({ basename: 'f3.jpg', mime: 'image/jpeg' })
		const loadMore = vi.fn().mockResolvedValueOnce([f3]).mockResolvedValue([])

		await vm.open([f1, f2], f2, { canLoop: false, loadMore })
		await flushPromises()
		expect(loadMore).toHaveBeenCalledOnce()

		await emitModal('next')
		await wrapper.vm.$nextTick()
		expect(modalName()).toBe('f3.jpg')
	})

	it('asks once while more are on their way', async () => {
		const { vm, emitModal } = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		const loadMore = vi.fn(() => new Promise<never>(() => {}))

		await vm.open([f1, f2], f2, { canLoop: false, loadMore })
		await flushPromises()
		await emitModal('previous')
		await emitModal('next')
		await flushPromises()

		expect(loadMore).toHaveBeenCalledOnce()
	})

	it('asks for nothing before the last file', async () => {
		const { vm } = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		const loadMore = vi.fn(async () => [])

		await vm.open([f1, f2], f1, { loadMore })
		await flushPromises()

		expect(loadMore).not.toHaveBeenCalled()
	})
})

describe('nodes from another copy of Vue', () => {
	/**
	 * A node as the Files app hands it over when it runs another copy of Vue
	 * than the viewer: wrapped in that copy's reactivity, which answers for
	 * its raw object the way any copy of Vue does.
	 *
	 * @param file - The node to wrap
	 */
	function fromAnotherVue<T extends object>(file: T): T {
		return new Proxy(file, {
			get: (target, key, receiver) => key === '__v_raw' ? target : Reflect.get(target, key, receiver),
		})
	}

	it('still finds the file shown in its list, and steps on from it', async () => {
		const { vm, wrapper, modalProps, modalName, emitModal } = mountViewer([imageHandler()])
		const a = fromAnotherVue(makeFile({ basename: 'a.jpg', mime: 'image/jpeg' }))
		const b = fromAnotherVue(makeFile({ basename: 'b.jpg', mime: 'image/jpeg' }))

		await vm.open([a, b], a)
		await wrapper.vm.$nextTick()
		expect(modalProps().hasNext).toBe(true)

		await emitModal('next')
		await wrapper.vm.$nextTick()
		expect(modalName()).toBe('b.jpg')
	})
})

describe('a neighbour changed elsewhere', () => {
	it('is shown from its new node when the user steps to it', async () => {
		const { vm, wrapper, modalName, emitModal } = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		await vm.open([f1, f2], f1)
		await wrapper.vm.$nextTick()

		const renamed = makeFile({ id: f2.fileid, basename: 'holiday.jpg', mime: 'image/jpeg' })
		const updated = vi.mocked(subscribe).mock.calls.findLast(([event]) => event === 'files:node:updated')![1] as (node: unknown) => void
		updated(renamed)
		await emitModal('next')
		await wrapper.vm.$nextTick()

		expect(modalName()).toBe('holiday.jpg')
	})
})

describe('the header actions shown as buttons', () => {
	afterEach(() => {
		Object.defineProperty(document.documentElement, 'clientWidth', { value: 1280, configurable: true })
		window.dispatchEvent(new Event('resize'))
	})

	// Full screen and the sidebar are about the viewer rather than the file,
	// and were one click further away than they need be, in the menu
	it('are full screen and the sidebar, after rotate and edit where offered', async () => {
		const { vm, wrapper, modalProps } = mountViewer([makeHandler({ ...imageHandler(), canEdit: true })])
		const file = makeFile({ mime: 'image/jpeg' })
		await vm.open([file], file)
		await wrapper.vm.$nextTick()
		wrapper.find('oca-viewer-image').element.dispatchEvent(new CustomEvent('loaded'))
		await wrapper.vm.$nextTick()

		// Rotate, edit, full screen, open sidebar
		expect(modalProps().inlineActions).toBe(4)
		expect(wrapper.findAll('.nc-action-button-stub').slice(0, 4).map((button) => button.text()))
			.toEqual(['Rotate left', 'Edit', 'Full screen', 'Open sidebar'])
	})

	it('leave out the sidebar where it is not offered', async () => {
		const { vm, wrapper, modalProps } = mountViewer([imageHandler()])
		const file = makeFile({ mime: 'image/png' })
		await vm.open([file], file, { enableSidebar: false })
		await wrapper.vm.$nextTick()

		expect(modalProps().inlineActions).toBe(1)
	})

	it('are only the file\'s own on a phone, where the header has no room', async () => {
		Object.defineProperty(document.documentElement, 'clientWidth', { value: 400, configurable: true })
		window.dispatchEvent(new Event('resize'))
		const { vm, wrapper, modalProps } = mountViewer([imageHandler()])
		const file = makeFile({ mime: 'image/png' })
		await vm.open([file], file)
		await wrapper.vm.$nextTick()

		expect(modalProps().inlineActions).toBe(0)
	})
})

describe('stepping to another file', () => {
	// A load like opening one: no spinner left the file half loaded on
	// screen, and a slideshow counted the load against its delay
	it('waits for it to load, as when opening one', async () => {
		const { vm, wrapper, emitModal, modalProps } = mountViewer([imageHandler()])
		const f1 = makeFile({ basename: 'f1.jpg', mime: 'image/jpeg' })
		const f2 = makeFile({ basename: 'f2.jpg', mime: 'image/jpeg' })
		await vm.open([f1, f2], f1)
		await wrapper.vm.$nextTick()
		wrapper.find('oca-viewer-image').element.dispatchEvent(new CustomEvent('loaded'))
		await wrapper.vm.$nextTick()
		expect(wrapper.find('.viewer__loading').exists()).toBe(false)

		await emitModal('next')
		await wrapper.vm.$nextTick()
		expect(wrapper.find('.viewer__loading').exists()).toBe(true)
		expect(modalProps().slideshowPaused).toBe(true)

		wrapper.find('oca-viewer-image').element.dispatchEvent(new CustomEvent('loaded'))
		await wrapper.vm.$nextTick()
		expect(wrapper.find('.viewer__loading').exists()).toBe(false)
		expect(modalProps().slideshowPaused).toBe(false)
	})
})

describe('a handler that defines its element in onInit()', () => {
	let count = 0

	/**
	 * A handler whose onInit() defines its element, under a tag no other test uses.
	 *
	 * @param before - What onInit() waits for before defining it
	 */
	function lazyHandler(before: () => Promise<void> = async () => {}) {
		const tagName = `oca-viewer-lazy-${++count}`
		const onInit = vi.fn(async () => {
			await before()
			customElements.define(tagName, class extends HTMLElement {})
		})
		return makeHandler({ id: tagName, tagName, enabled: () => true, onInit })
	}

	it('renders the element only once onInit() has defined it', async () => {
		let resolve!: () => void
		const handler = lazyHandler(() => new Promise((r) => {
			resolve = r
		}))
		const { vm, renderedTags } = mountViewer([handler])
		const file = makeFile()
		await vm.open([file], file)
		await flushPromises()

		// Rendered before it is defined, it would get its bindings as
		// attributes and lose them on upgrade
		expect(renderedTags()).not.toContain(handler.tagName)
		expect(customElements.get(handler.tagName)).toBeUndefined()

		resolve()
		await flushPromises()

		expect(customElements.get(handler.tagName)).toBeDefined()
		expect(renderedTags()).toContain(handler.tagName)
	})

	it('calls onInit() once however many files open with it', async () => {
		const handler = lazyHandler()
		const { vm, renderedTags } = mountViewer([handler])
		const first = makeFile({ basename: 'first.txt' })
		const second = makeFile({ basename: 'second.txt' })
		await vm.open([first, second], first)
		await flushPromises()
		await vm.open([first, second], second)
		await flushPromises()

		expect(handler.onInit).toHaveBeenCalledOnce()
		expect(renderedTags()).toContain(handler.tagName)
	})

	it('shows the error when onInit() fails, and tries again on the next open', async () => {
		const handler = lazyHandler()
		vi.mocked(handler.onInit!).mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
		const { vm, errorText, renderedTags } = mountViewer([handler])
		const file = makeFile()
		await vm.open([file], file)
		await flushPromises()

		expect(errorText()).toBe('Failed to fetch dynamically imported module')
		expect(renderedTags()).not.toContain(handler.tagName)

		vm.close()
		await vm.open([file], file)
		await flushPromises()

		expect(handler.onInit).toHaveBeenCalledTimes(2)
		expect(renderedTags()).toContain(handler.tagName)
	})
})
