/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile, IFolder, IView } from '@nextcloud/files'
import type { ViewerEventMap, ViewerSession } from './session.ts'
import type ViewerVue from './views/Viewer.vue'

import { loadImplementation, scope } from './scope.ts'

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
	 * The list of files currently opened in the viewer. When comparing, the
	 * two files compared, the older one first (see `comparison`)
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
	 * How the viewer compares `files`, or nothing when it is not comparing.
	 * Side by side, each of the two elements shows its own `file`; in
	 * differences, the only element shows what changed from the first file of
	 * `files`, the older one, to its `file` (see `IHandler.canShowDifferences`).
	 */
	comparison?: ComparisonView
}

/**
 * How the viewer shows two files compared
 */
export type ComparisonView = 'side-by-side' | 'differences'

/**
 * How to compare two files
 */
export interface CompareOptions {
	/**
	 * The view to open on. Defaults to side by side, which is also what is
	 * shown when the handler cannot show the differences.
	 */
	view?: ComparisonView

	/**
	 * The handler to show both files with, rather than the one each would
	 * open with
	 */
	handlerId?: string
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
 * What the viewer hands the element of the handler showing a file, with the
 * `before-download` event it dispatches on it before downloading that file,
 * from its own Download, Ctrl+S or the Files download action. A handler with
 * edits not written yet saves them first:
 * ```ts
 * element.addEventListener('before-download', (event) => {
 *   if (dirty) {
 *     event.detail.waitUntil(save())
 *   }
 * })
 * ```
 * A promise that rejects cancels the download, and the viewer says so.
 */
export interface ViewerBeforeDownloadDetail {
	/**
	 * The file about to be downloaded
	 */
	file: IFile

	/**
	 * Hold the download until the promise settles
	 *
	 * @param promise - What the download waits for
	 */
	waitUntil(promise: Promise<unknown>): void
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
	 * Whether to open straight into editing mode (e.g. from an `editing=true` URL).
	 * Ignored for handlers that do not support editing.
	 */
	editing?: boolean

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

const defaultViewerOptions: ViewerOptions = {
	canLoop: true,
	enableSidebar: true,
}

export interface ViewerAPI {
	/**
	 * Show files. Resolves with the session of this opening, which tells of
	 * the file shown, editing and the viewer closing (see `ViewerEventMap`).
	 */
	open(nodes: IFile[], file?: IFile, options?: ViewerOptions, handlerId?: string): Promise<ViewerSession>
	openFolder(folder: IFolder, file?: IFile, options?: ViewerOptions, handlerId?: string): Promise<ViewerSession>
	/**
	 * Show `file` compared with `base`, an older version of it: what changed
	 * from `base` to `file`. Side by side, `base` is on the left. Resolves with
	 * the session of this opening.
	 */
	compare(file: IFile, base: IFile, options?: CompareOptions): Promise<ViewerSession>

	/**
	 * Show an already-opened file by its id, without an `update:file` event.
	 * Used to sync the viewer to browser history (back/forward).
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

/**
 * The viewer of the page. Tells any page of the file shown, editing and the
 * viewer closing, whoever opened it (see `ViewerEventMap`).
 */
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

	async open(nodes: IFile[], file?: IFile, options: ViewerOptions = defaultViewerOptions, handlerId?: string): Promise<ViewerSession> {
		return (await this.mounted()).open(nodes, file, options, handlerId)
	}

	async openFolder(folder: IFolder, file?: IFile, options: ViewerOptions = defaultViewerOptions, handlerId?: string): Promise<ViewerSession> {
		return (await this.mounted()).openFolder(folder, file, options, handlerId)
	}

	async compare(file: IFile, base: IFile, options?: CompareOptions): Promise<ViewerSession> {
		return (await this.mounted()).compare(file, base, options)
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

	addEventListener<K extends keyof ViewerEventMap>(type: K, listener: (event: ViewerEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void
	addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void
	addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
		super.addEventListener(type, listener, options)
	}

	removeEventListener<K extends keyof ViewerEventMap>(type: K, listener: (event: ViewerEventMap[K]) => void, options?: boolean | EventListenerOptions): void
	removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void
	removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
		super.removeEventListener(type, listener, options)
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
