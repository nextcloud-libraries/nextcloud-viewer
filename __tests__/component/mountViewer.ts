import type { File } from '@nextcloud/files'
/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { VueWrapper } from '@vue/test-utils'
import type { IHandler } from '../../lib/index.ts'
import type { ViewerOptions } from '../../lib/viewer.ts'

import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { defineComponent, h } from 'vue'
import Viewer from '../../lib/views/Viewer.vue'
import { registerTestHandlers } from '../factories.ts'

/**
 * Minimal NcModal stub.
 *
 * It renders the default slot and the `#actions` slot so we can assert on the
 * handler custom-element markup and drive the header actions. The style is
 * kept, as the real modal applies it: that is how the viewer makes room for
 * the sidebar. Navigation is
 * driven from tests through `findComponent(NcModalStub).vm.$emit('next'|'previous'|'close')`.
 * The relevant props (`name`, `show`, `hasNext`, `hasPrevious`, `isComparing`
 * related flags) are declared so they can be read back via `.props()`.
 */
export const NcModalStub = defineComponent({
	name: 'NcModal',
	inheritAttrs: false,
	props: {
		name: { type: String, default: '' },
		show: { type: Boolean, default: false },
		hasNext: { type: Boolean, default: false },
		hasPrevious: { type: Boolean, default: false },
		enableSlideshow: { type: Boolean, default: false },
		disableSwipe: { type: Boolean, default: false },
		slideshowPaused: { type: Boolean, default: false },
		lightBackdrop: { type: Boolean, default: false },
	},
	emits: ['next', 'previous', 'close'],
	template: `
		<div
			class="nc-modal-stub"
			:style="$attrs.style"
			:data-handler="$attrs['data-handler']"
			:data-name="name"
			:data-show="String(show)"
			:data-has-next="String(hasNext)"
			:data-has-previous="String(hasPrevious)">
			<div class="nc-modal-stub__actions"><slot name="actions" /></div>
			<!-- The class names NcModal renders, which the viewer looks up to size
			     itself and to tell a click beside the media from one on it -->
			<div class="modal-container">
				<div class="nc-modal-stub__content modal-container__content"><slot /></div>
			</div>
		</div>
	`,
})

const NcActionButtonStub = defineComponent({
	name: 'NcActionButton',
	emits: ['click'],
	template: '<button class="nc-action-button-stub" @click="$emit(\'click\', $event)"><slot name="icon" /><slot /></button>',
})

const NcEmptyContentStub = defineComponent({
	name: 'NcEmptyContent',
	props: {
		name: { type: String, default: '' },
		description: { type: String, default: '' },
	},
	template: '<div class="nc-empty-content-stub" :data-name="name">{{ name }}<slot name="icon" /><slot /></div>',
})

const NcLoadingIconStub = defineComponent({
	name: 'NcLoadingIcon',
	template: '<span class="nc-loading-icon-stub" />',
})

const IconStub = defineComponent({
	name: 'IconStub',
	render() {
		return h('span', { class: 'icon-stub' })
	},
})

/**
 * Stand in for the ResizeObserver, which jsdom does not implement, keeping
 * what the viewer observes and letting a test say that something resized.
 */
function stubResizeObserver() {
	const observed: Element[] = []
	const unobserved: Element[] = []
	let notify: (() => void) | undefined

	vi.stubGlobal('ResizeObserver', class {
		constructor(callback: () => void) {
			notify = callback
		}

		observe(element: Element) {
			observed.push(element)
		}

		unobserve(element: Element) {
			unobserved.push(element)
		}

		disconnect() {}
	})

	return {
		observed: () => observed,
		unobserved: () => unobserved,
		/** Report a resize, and wait out the viewer's debounce of it */
		resized: async () => {
			notify?.()
			await new Promise((resolve) => {
				setTimeout(resolve, 150)
			})
		},
	}
}

export interface MountViewerResult {
	wrapper: VueWrapper
	/** The Viewer instance's exposed API + internal component vm. */
	vm: any
	/** Emit an NcModal event (next|previous|close) to drive navigation. */
	emitModal: (event: 'next' | 'previous' | 'close') => Promise<void>
	/** Read the modal `data-handler` attribute. */
	modalHandlerId: () => string | undefined
	/** Read the modal name (basename / comparison title). */
	modalName: () => string | undefined
	/** Props currently passed to the NcModal stub. */
	modalProps: () => Record<string, unknown>
	/** Whether the modal is rendered at all (it is not while closed). */
	modalExists: () => boolean
	/** All rendered handler custom-element tag names (e.g. `oca-viewer-test`). */
	renderedTags: () => string[]
	/** Whether the error empty-content is shown, and its message. */
	errorText: () => string | undefined
	/** The inline style the viewer gives the modal, e.g. to fit beside the sidebar. */
	modalStyle: () => string | undefined
	/** The elements the viewer watches for resizes. */
	observed: () => Element[]
	/** The elements it has stopped watching. */
	unobserved: () => Element[]
	/** Report a resize of what is observed, debounce included. */
	resized: () => Promise<void>
}

/**
 * Mount the Viewer with lightweight stubs and the given handlers registered.
 *
 * @param handlers - Handlers to register before mounting. When omitted the
 *   caller is expected to have registered handlers already.
 */
export function mountViewer(handlers: IHandler[] = []): MountViewerResult {
	if (handlers.length > 0) {
		registerTestHandlers(...handlers)
	}

	const observer = stubResizeObserver()

	const wrapper = mount(Viewer, {
		attachTo: document.body,
		global: {
			stubs: {
				NcModal: NcModalStub,
				NcActionButton: NcActionButtonStub,
				NcEmptyContent: NcEmptyContentStub,
				NcIconSvgWrapper: IconStub,
				NcLoadingIcon: NcLoadingIconStub,
				ChevronLeft: IconStub,
				DockRight: IconStub,
				FileAlertOutlineIcon: IconStub,
			},
		},
	})

	const findModal = () => wrapper.findComponent(NcModalStub)

	const emitModal = async (event: 'next' | 'previous' | 'close') => {
		findModal().vm.$emit(event)
		await wrapper.vm.$nextTick()
	}

	const renderedTags = () => {
		const html = wrapper.html()
		return [...html.matchAll(/<(oca-viewer-[a-z0-9-]+)/g)].map(([, tag]) => tag!)
	}

	return {
		...observer,
		wrapper,
		vm: wrapper.vm as any,
		emitModal,
		modalStyle: () => findModal().attributes('style'),
		modalHandlerId: () => findModal().attributes('data-handler'),
		modalName: () => findModal().attributes('data-name'),
		modalProps: () => findModal().props(),
		modalExists: () => findModal().exists(),
		renderedTags,
		errorText: () => {
			const ec = wrapper.find('.nc-empty-content-stub')
			return ec.exists() ? ec.attributes('data-name') : undefined
		},
	}
}

export type { File, ViewerOptions }
