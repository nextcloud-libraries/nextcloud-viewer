/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFile } from '@nextcloud/files'
import type { ViewerBeforeDownloadDetail } from './viewer.ts'

/**
 * What the viewer tells about itself, on the viewer (`getViewer()`) for any
 * page, and on the session `open()` resolves with for its opener. Shaped like
 * what handler elements emit: a `CustomEvent` whose `detail` holds the values.
 */
export interface ViewerEventMap {
	/**
	 * Another file is shown: the next or previous one, or the one after a
	 * deleted file. Not when a page asks for it with `goTo()`.
	 */
	'update:file': CustomEvent<[file: IFile]>

	/**
	 * Editing was entered or left.
	 */
	'update:editing': CustomEvent<[editing: boolean]>

	/**
	 * The viewer closed.
	 */
	close: CustomEvent<[]>

	/**
	 * The file shown is about to be downloaded, from the viewer's own
	 * Download, Ctrl+S or the Files download action. The same event the
	 * handler's element gets: what is handed to `waitUntil()` holds the
	 * download, and a promise that rejects cancels it.
	 */
	'before-download': CustomEvent<ViewerBeforeDownloadDetail>
}

/** The events telling what happened, whose `detail` holds the values */
export type ViewerNotification = Exclude<keyof ViewerEventMap, 'before-download'>

/**
 * Dispatch one of the viewer's events.
 *
 * @param target - Where to dispatch it
 * @param type - The event
 * @param detail - Its values
 */
export function dispatchViewerEvent<K extends ViewerNotification>(target: EventTarget, type: K, ...detail: ViewerEventMap[K]['detail']): void {
	target.dispatchEvent(new CustomEvent(type, { detail }))
}

/**
 * One opening of the viewer, for the page that asked for it.
 *
 * It tells of the files shown and of editing until another opening takes
 * over, and of the viewer closing in any case: a page passing its file on to
 * another with `open()` still hears the viewer close.
 */
export class ViewerSession extends EventTarget {
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
