/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile } from '@nextcloud/files'

import { canDownload } from './canDownload.ts'
import { getPreviewIfAny } from './previewUtils.ts'

/** The space a file is shown in, in CSS pixels */
interface AvailableSpace {
	width: number
	height: number
}

/**
 * Fetch the preview a neighbouring picture will ask for, so it shows at once
 * when the user steps to it.
 *
 * The same URL the image handler builds for the same space, or the browser
 * cache has nothing for it. Nothing for what is not shown from a preview:
 * an svg or a gif shows the file itself, as does one with no preview, and a
 * share that forbids downloading answers only to a header an image request
 * cannot carry.
 *
 * @param file - The neighbouring file
 * @param space - The space it will be shown in
 */
export function preloadNeighbourPreview(file: IFile, space?: AvailableSpace): Promise<void> {
	const fromPreview = Boolean(file.attributes?.hasPreview || file.attributes?.previewUrl)
	if (!fromPreview || file.mime === 'image/svg+xml' || file.mime === 'image/gif' || !canDownload(file)) {
		return Promise.resolve()
	}
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve()
		image.onerror = () => reject(new Error(`Could not preload ${file.basename}`))
		image.src = getPreviewIfAny(file, space)
	})
}

/**
 * Read as far as the metadata of a neighbouring video or sound, so it has
 * its size and length when the user steps to it, then let go of it.
 *
 * @param file - The neighbouring file
 */
export function preloadNeighbourMetadata(file: IFile): Promise<void> {
	return new Promise((resolve) => {
		const media = document.createElement('video')
		media.preload = 'metadata'
		media.muted = true
		const done = () => {
			media.removeAttribute('src')
			media.load()
			resolve()
		}
		media.addEventListener('loadedmetadata', done, { once: true })
		// A file the browser cannot play is not worth a failure of its own:
		// opening it says so
		media.addEventListener('error', done, { once: true })
		media.src = file.encodedSource
	})
}
