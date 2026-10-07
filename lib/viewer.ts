/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile, IFolder, IView } from '@nextcloud/files'
import type ViewerVue from './views/Viewer.vue'

import { canView } from './handlers.ts'
import { getHandlerForFile } from './helpers/handlerHelper.ts'
import { loadImplementation, scope } from './scope.ts'
import { initHandlerElement } from './utils/customElements.ts'

/**
 * List of props provided to your custom component.
 * Use it like this:
 * ```ts
 * <script setup lang="ts">
 * import type { ViewerProps } from '@nextcloud/viewer'
 *
 * const props = defineProps<ViewerProps>()
 * ```
 */
export interface ViewerProps {
	/**
	 * The file to be displayed
	 */
	file: IFile

	/**
	 * The list of files currently opened in the viewer
	 */
	files: IFile[]

	/**
	 * The max height of the viewer container
	 */
	maxHeight: number

	/**
	 * The max width of the viewer container
	 */
	maxWidth: number

	/**
	 * Whether the viewer is in editing mode
	 */
	editing: boolean

	/**
	 * Whether the sidebar is shown
	 */
	isSidebarShown: boolean

	/**
	 * Quarter turns anticlockwise the viewer is showing on top of the
	 * file's own orientation, while a rotation is being written. Handlers
	 * that can turn their content should honour it; the rest may ignore it.
	 */
	turns?: number

	/**
	 * Optional client-side source to display instead of fetching from the server
	 * (e.g. an object URL for a freshly edited image not yet reflected in the
	 * server preview). Handlers that support it should prefer this over `file`.
	 */
	localSource?: string

	/**
	 * Whether the file is shown inline, outside the viewer, as the preview of a
	 * link to it (see `getViewer().elementFor()`). A hint that handlers should
	 * not take over the page, for example by autoplaying. Editing is usually
	 * better left to the viewer, which the caller can open on the file.
	 */
	embedded?: boolean
}

/**
 * List of emits that can be emitted by your custom component.
 * Use it like this:
 * ```ts
 * <script setup lang="ts">
 * import type { ViewerEmits } from '@nextcloud/viewer'
 *
 * const emit = defineEmits<ViewerEmits>()
 * ```
 */
export interface ViewerEmits {
	/**
	 * Emit this event to notify the viewer that your component is done loading.
	 */
	loaded: []

	/**
	 * Emit this event to notify the viewer that an  error occurred while loading the file.
	 * If provided, a custom error message will be shown.
	 *
	 * @param error The error that occurred
	 */
	errored: [Error]

	/**
	 * Emit this event to disable or enable the swiping gesture.
	 * This is usually used when your component provides its own swiping mechanism (e.g. the video player controls).
	 */
	'update:canSwipe': [boolean]

	/**
	 * Emit this event to notify the viewer that the editing mode changed.
	 *
	 * @param editing Whether the viewer is now in editing mode
	 */
	'update:editing': [boolean]

	/**
	 * Emit this event when your component starts or stops playing media. The
	 * slideshow waits while media plays, rather than moving on in the middle of it.
	 *
	 * @param playing Whether media is playing
	 */
	'update:playing': [boolean]
}

/**
 * Options for opening the viewer
 */
export type ViewerOptions = {
	/**
	 * Will be called to append more files when reaching the end of the current list
	 */
	loadMore?: () => Promise<IFile[]>

	/**
	 * Called when navigating to the previous item, with the file navigated to.
	 */
	onPrev?: (file: IFile) => void

	/**
	 * Called when navigating to the next item, with the file navigated to.
	 */
	onNext?: (file: IFile) => void

	/**
	 * Called once when the viewer is closed.
	 *
	 * Opening over a viewer that is still open does not drop it: every
	 * `onClose` passed since the viewer opened is called when it closes, each
	 * once, so a handler passing its file to another one with `open()` still
	 * lets the first opener clean up.
	 */
	onClose?: () => void

	/**
	 * Whether to open straight into editing mode (e.g. from an `editing=true` URL).
	 * Ignored for handlers that do not support editing.
	 */
	editing?: boolean

	/**
	 * Called when the editing state changes, so the opener can reflect it (e.g.
	 * in the URL).
	 */
	onEditingChange?: (editing: boolean) => void

	/**
	 * Whether the viewer can loop from last to first item and vice versa. Defaults to true.
	 */
	canLoop?: boolean

	/**
	 * Whether to start the slideshow as soon as the viewer opens. Ignored for
	 * a single file, as there is nothing to move on to.
	 */
	startSlideshow?: boolean

	/**
	 * Whether to offer the Files sidebar for the open file. Defaults to true.
	 * Turn it off for a file the sidebar cannot resolve, such as an old
	 * version of a file, which is served from its own dav endpoint.
	 */
	enableSidebar?: boolean

	/**
	 * The files view the viewer was opened from. Forwarded to the file actions
	 * rendered inside the viewer (download, delete, details, …) so they can run
	 * with the same context as in the files list.
	 */
	view?: IView

	/**
	 * The folder the opened files live in. Forwarded to those file actions.
	 */
	folder?: IFolder
}

// No callbacks here: the viewer calls them optionally, and every onClose
// passed is kept until the viewer closes (see open() in Viewer.vue)
const defaultViewerOptions: ViewerOptions = {
	canLoop: true,
	enableSidebar: true,
}

export interface ViewerAPI {
	open(nodes: IFile[], file?: IFile, options?: ViewerOptions, handlerId?: string): Promise<void>
	openFolder(folder: IFolder, file?: IFile, options?: ViewerOptions, handlerId?: string): Promise<void>
	compare(node1: IFile, node2: IFile, handlerId?: string): Promise<void>

	/**
	 * Show an already-opened file by its id, without triggering navigation
	 * callbacks. Used to sync the viewer to browser history (back/forward).
	 *
	 * @param fileid - The id of the file to show
	 */
	goTo(fileid: number): void

	/**
	 * Close the viewer.
	 */
	close(): void

	/**
	 * Set the editing state (used to sync with the `editing` URL param).
	 *
	 * @param editing - Whether the viewer should be in editing mode
	 */
	setEditing(editing: boolean): void
}

export class Viewer extends EventTarget implements ViewerAPI {
	private viewer: InstanceType<typeof ViewerVue> | null = null

	/**
	 * Set the viewer instance (called from init.ts)
	 * Private, do not use directly.
	 *
	 * @param viewer - The mounted Viewer Vue component instance
	 */
	_setViewer(viewer: InstanceType<typeof ViewerVue>) {
		this.viewer = viewer
	}

	/**
	 * The mounted viewer, loading the implementation the first time one
	 * is needed. Nothing on the page carries the viewer's own weight
	 * until a file is actually opened.
	 */
	private async mounted(): Promise<InstanceType<typeof ViewerVue>> {
		if (!this.viewer) {
			await loadImplementation()
		}
		if (!this.viewer) {
			throw new Error('The viewer implementation did not register itself')
		}
		return this.viewer
	}

	async open(nodes: IFile[], file?: IFile, options: ViewerOptions = defaultViewerOptions, handlerId?: string): Promise<void> {
		(await this.mounted()).open(nodes, file, options, handlerId)
	}

	async openFolder(folder: IFolder, file?: IFile, options: ViewerOptions = defaultViewerOptions, handlerId?: string): Promise<void> {
		(await this.mounted()).openFolder(folder, file, options, handlerId)
	}

	async compare(node1: IFile, node2: IFile, handlerId?: string): Promise<void> {
		(await this.mounted()).compare(node1, node2, handlerId)
	}

	goTo(fileid: number): void {
		this.viewer?.goTo(fileid)
	}

	close(): void {
		this.viewer?.close()
	}

	setEditing(editing: boolean): void {
		this.viewer?.setEditing(editing)
	}

	/**
	 * The element that shows a file, to render it outside the viewer, as the
	 * preview of a file link in a chat or a document does.
	 *
	 * Resolves with the tag name of the custom element of the handler the
	 * viewer would open the file with, once that element is defined (see
	 * `IHandler.onInit`), or with nothing when no handler takes the file. The
	 * element takes the props every handler does (`ViewerProps`), and says it
	 * has loaded or failed with the same events. Loads nothing of the viewer
	 * itself.
	 *
	 * @param file - The file to show
	 */
	async elementFor(file: IFile): Promise<string | undefined> {
		if (!canView(file)) {
			return undefined
		}
		const handler = getHandlerForFile(file)
		if (handler === undefined) {
			return undefined
		}
		await initHandlerElement(handler)
		return handler.tagName
	}
}

/**
 * Get the shared viewer instance, creating it on first use.
 *
 * Shared across every copy of the library on the page that speaks the
 * same handler ABI, so the viewer stays the single modal it has to be.
 */
export function getViewer(): Viewer {
	return scope.service ??= new Viewer()
}
