/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile } from '@nextcloud/files'

import { preloadImageSize } from '../services/mediaPreloader.ts'
import { canDownload } from './canDownload.ts'
import { getPreviewIfAny, getServerPreview } from './previewUtils.ts'

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

/** How much of a file is read to find where its index is */
const INDEX_PROBE_BYTES = 64 * 1024

/** The formats that keep their index in a `moov` box, at either end */
const ISO_MEDIA_MIMES = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'audio/mp4', 'audio/x-m4a', 'audio/m4a']

/**
 * Whether the user asked the browser to spare their data.
 */
function savesData(): boolean {
	return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
}

/**
 * Walk the top-level boxes of an ISO media file and say whether its index
 * (`moov`) comes before its data (`mdat`).
 *
 * @param bytes - The start of the file
 * @return true or false, or undefined when the start read does not tell
 */
export function indexComesFirst(bytes: Uint8Array): boolean | undefined {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	let offset = 0
	while (offset + 8 <= bytes.length) {
		const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
		if (type === 'moov') {
			return true
		}
		if (type === 'mdat') {
			return false
		}
		let size = view.getUint32(offset)
		if (size === 1) {
			// A 64-bit size follows the type
			if (offset + 16 > bytes.length) {
				return undefined
			}
			size = Number(view.getBigUint64(offset + 8))
		}
		// 0 runs to the end of the file, with no index after it
		if (size === 0) {
			return false
		}
		if (size < 8) {
			return undefined
		}
		offset += size
	}
	return undefined
}

/**
 * Whether reading a file's metadata stops near its start.
 *
 * An mp4 whose index sits at the end has the browser read the whole file
 * to get there (nextcloud/viewer#2284), so the start of it is read first,
 * and no more than that, to find out. Other formats keep their metadata
 * up front.
 *
 * With fetch rather than axios: the read is cut short by hand, should the
 * server answer the whole file rather than the range asked for, and a GET
 * needs no request token.
 *
 * @param file - The file to look into
 */
export async function hasIndexUpFront(file: IFile): Promise<boolean> {
	if (!ISO_MEDIA_MIMES.includes(file.mime ?? '')) {
		return true
	}
	const controller = new AbortController()
	try {
		const response = await fetch(file.encodedSource, {
			headers: { Range: `bytes=0-${INDEX_PROBE_BYTES - 1}` },
			signal: controller.signal,
		})
		if (!response.ok || !response.body) {
			return false
		}
		const reader = response.body.getReader()
		const bytes = new Uint8Array(INDEX_PROBE_BYTES)
		let length = 0
		while (length < INDEX_PROBE_BYTES) {
			const { done, value } = await reader.read()
			if (done) {
				break
			}
			const chunk = value.subarray(0, INDEX_PROBE_BYTES - length)
			bytes.set(chunk, length)
			length += chunk.length
		}
		return indexComesFirst(bytes.subarray(0, length)) === true
	} catch {
		return false
	} finally {
		controller.abort()
	}
}

/**
 * Get a neighbouring video ready for when the user steps to it: its
 * preview, which is its poster and its size, or else its metadata when
 * that can be read without the whole file.
 *
 * @param file - The neighbouring video
 * @param space - The space it will be shown in
 */
export async function preloadNeighbourVideo(file: IFile, space?: AvailableSpace): Promise<void> {
	if (savesData() || isEncrypted(file)) {
		return
	}
	const preview = canDownload(file) ? getServerPreview(file, space) : undefined
	if (preview) {
		await preloadImageSize(preview)
		return
	}
	if (await hasIndexUpFront(file)) {
		await preloadNeighbourMetadata(file)
	}
}

/**
 * Get a neighbouring sound's metadata, when it can be read without the
 * whole file.
 *
 * @param file - The neighbouring sound
 */
export async function preloadNeighbourAudio(file: IFile): Promise<void> {
	if (savesData() || isEncrypted(file)) {
		return
	}
	if (await hasIndexUpFront(file)) {
		await preloadNeighbourMetadata(file)
	}
}

/**
 * Whether a file is end-to-end encrypted, whose bytes say nothing until
 * they are decrypted.
 *
 * @param file - The file
 */
function isEncrypted(file: IFile): boolean {
	return Boolean(file.attributes?.['e2ee-is-encrypted'])
}
