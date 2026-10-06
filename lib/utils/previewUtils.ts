/**
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile } from '@nextcloud/files'

import { encodePath } from '@nextcloud/paths'
import { generateUrl } from '@nextcloud/router'
import { getSharingToken, isPublicShare } from '@nextcloud/sharing/public'

/** The space a preview has to fill, in CSS pixels */
interface AvailableSpace {
	width: number
	height: number
}

/**
 * Preview sizes are rounded up to a multiple of this many pixels.
 *
 * The server renders, and caches, one preview per size asked for. Asking
 * for the exact space available would mean a fresh render for every window
 * the file is looked at in, so a handful of sizes are shared instead.
 */
const SIZE_STEP = 256

/**
 * The size asked for when the user zooms in for detail.
 *
 * The server renders no preview larger than the original, nor than its own
 * `preview_max_x`/`preview_max_y` (4096 by default), so this gets the most
 * detail it will give. The ceiling is for a server allowed more, as a
 * bitmap past this many pixels is more than a browser handles comfortably.
 */
const LARGEST_PREVIEW = 8192

/**
 * The pixel size to ask a preview for.
 *
 * As many pixels as the space it has to fill, and never more than the
 * display can show: asking for the full screen for a picture shown in a
 * corner of it has the server render an image nobody will see the detail
 * of, which on a HiDPI display is several times the work.
 *
 * @param available - The space the preview has to fill, in CSS pixels
 */
function previewSize(available?: AvailableSpace): { x: number, y: number } {
	const ratio = window.devicePixelRatio || 1
	const display = {
		x: Math.floor(screen.width * ratio),
		y: Math.floor(screen.height * ratio),
	}

	if (!available?.width || !available.height) {
		return display
	}

	const step = (value: number) => Math.ceil((value * ratio) / SIZE_STEP) * SIZE_STEP
	return {
		x: Math.min(display.x, step(available.width)),
		y: Math.min(display.y, step(available.height)),
	}
}

/**
 * @param file - The file to resolve a preview URL for
 * @param available - The space the preview has to fill, in CSS pixels.
 *   Defaults to the whole display, for a caller that does not know yet.
 * @return the preview url if the file have an existing preview or the absolute dav remote path if none.
 */
export function getPreviewIfAny(file: IFile, available?: AvailableSpace): string {
	if (file.attributes.previewUrl) {
		return file.attributes.previewUrl
	}

	const { x, y } = previewSize(available)
	// Encoded: this is handed to a media element as its `src`, and a name
	// holding a `#` or a `?` would otherwise cut the URL short.
	return serverPreview(file, x, y) ?? file.encodedSource
}

/**
 * The server's preview of a file, at the size it would be shown in.
 *
 * Nothing for a file without one, nor for a preview an app chose
 * (`previewUrl`): only the server's keeps the file's own proportions
 * (`a=true`), which is what a video is sized from before it has loaded.
 *
 * @param file - The file to resolve a preview URL for
 * @param available - The space it will be shown in
 */
export function getServerPreview(file: IFile, available?: AvailableSpace): string | undefined {
	if (file.attributes.previewUrl) {
		return undefined
	}
	const { x, y } = previewSize(available)
	return serverPreview(file, x, y)
}

/**
 * The most detailed preview the server will render of a file, to zoom into.
 *
 * Nothing for a file without a server preview, or with one an app chose
 * (`previewUrl`), whose size is not ours to change.
 *
 * @param file - The file to resolve a preview URL for
 */
export function getLargestPreview(file: IFile): string | undefined {
	if (file.attributes.previewUrl) {
		return undefined
	}
	return serverPreview(file, LARGEST_PREVIEW, LARGEST_PREVIEW)
}

/**
 * The URL of a server preview of a file, at most this many pixels on each side.
 *
 * @param file - The file to resolve a preview URL for
 * @param x - The most pixels wide
 * @param y - The most pixels high
 */
function serverPreview(file: IFile, x: number, y: number): string | undefined {
	const searchParams = `fileId=${file.fileid}`
		+ `&x=${x}`
		+ `&y=${y}`
		+ '&a=true'
		// A dav etag is quoted, and it reaches us either way round depending on
		// who wrote it, so both forms go: what is left has to be the same
		// string whichever it came from, or the URL is a different one for
		// the same file and the preview is fetched again for nothing.
		+ (file.attributes.etag ? `&etag=${String(file.attributes.etag).replace(/&quot;|"/g, '')}` : '')

	if (file.attributes.hasPreview) {
		// TODO: find a nicer standard way of doing this?
		if (isPublicShare()) {
			// The path inside the share: a folder share finds the file by
			// it, and its name alone only matches one at the top of it
			return generateUrl(`/apps/files_sharing/publicpreview/${getSharingToken()}?file=${encodePath(file.path)}&${searchParams}`)
		}
		return generateUrl(`/core/preview?${searchParams}`)
	}
	return undefined
}
