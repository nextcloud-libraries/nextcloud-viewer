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
			return generateUrl(`/apps/files_sharing/publicpreview/${getSharingToken()}?file=${encodePath(file.basename)}&${searchParams}`)
		}
		return generateUrl(`/core/preview?${searchParams}`)
	}

	// Encoded: this is handed to a media element as its `src`, and a name
	// holding a `#` or a `?` would otherwise cut the URL short.
	return file.encodedSource
}
