/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const preloadImageSize = vi.hoisted(() => vi.fn(async () => ({ width: 640, height: 360 })))
vi.mock('../lib/services/mediaPreloader.ts', () => ({ preloadImageSize }))

import {
	hasIndexUpFront,
	indexComesFirst,
	preloadNeighbourAudio,
	preloadNeighbourMetadata,
	preloadNeighbourPreview,
	preloadNeighbourVideo,
} from '../lib/utils/neighbours.ts'
import { getPreviewIfAny, getServerPreview } from '../lib/utils/previewUtils.ts'
import { makeFile } from './factories.ts'

/**
 * Keep the elements created while running a preload, to answer for the browser.
 *
 * @param tag - The tag of the elements to keep
 */
function keepCreated<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K][] {
	const created: HTMLElementTagNameMap[K][] = []
	const create = document.createElement.bind(document)
	vi.spyOn(document, 'createElement').mockImplementation((name: string) => {
		const element = create(name)
		if (name === tag) {
			created.push(element as HTMLElementTagNameMap[K])
		}
		return element
	})
	return created
}

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	preloadImageSize.mockClear()
})

/**
 * The bytes of top-level ISO media boxes, each as long as it says.
 *
 * @param boxes - The type and full length of each box
 */
function isoBoxes(...boxes: [string, number][]): Uint8Array {
	const bytes = new Uint8Array(boxes.reduce((total, [, length]) => total + length, 0))
	const view = new DataView(bytes.buffer)
	let offset = 0
	for (const [type, length] of boxes) {
		view.setUint32(offset, length)
		bytes.set([...type].map((c) => c.charCodeAt(0)), offset + 4)
		offset += length
	}
	return bytes
}

/**
 * Answer fetch with the given bytes in chunks, counting what was read.
 *
 * @param bytes - The whole file, as a server ignoring the range would send it
 */
function serve(bytes: Uint8Array) {
	const served = { requests: [] as RequestInit[], read: 0 }
	vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
		served.requests.push(init)
		let offset = 0
		return new Response(new ReadableStream({
			pull(controller) {
				if (offset >= bytes.length) {
					controller.close()
					return
				}
				const chunk = bytes.subarray(offset, offset + 16 * 1024)
				offset += chunk.length
				served.read = offset
				controller.enqueue(chunk)
			},
		}), { status: 206 })
	}))
	return served
}

/**
 * Whether the browser is asked to spare data.
 *
 * @param saveData - What the connection says
 */
function stubSaveData(saveData: boolean) {
	vi.stubGlobal('navigator', { ...navigator, connection: { saveData } })
}

describe('preloadNeighbourPreview', () => {
	const space = { width: 800, height: 600 }

	it('fetches the preview the image will ask for, at the size it will be shown', async () => {
		const sources: string[] = []
		vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function(this: HTMLImageElement, value: string) {
			sources.push(value)
			queueMicrotask(() => this.onload?.(new Event('load')))
		})
		const file = makeFile({ mime: 'image/jpeg', attributes: { hasPreview: true } })

		await preloadNeighbourPreview(file, space)

		expect(sources).toEqual([getPreviewIfAny(file, space)])
	})

	it.each([
		['an svg, shown from the file itself', { mime: 'image/svg+xml', attributes: { hasPreview: true } }],
		['a gif, shown from the file itself', { mime: 'image/gif', attributes: { hasPreview: true } }],
		['a picture with no preview, which would be the whole file', { mime: 'image/jpeg', attributes: { hasPreview: false } }],
		['a picture from a share that forbids downloading', { mime: 'image/jpeg', attributes: { hasPreview: true, 'share-attributes': JSON.stringify([{ scope: 'permissions', key: 'download', value: false }]) } }],
	])('fetches nothing for %s', async (_name, options) => {
		const created = keepCreated('img')

		await preloadNeighbourPreview(makeFile(options), space)

		expect(created).toEqual([])
	})
})

describe('preloadNeighbourMetadata', () => {
	it.each(['loadedmetadata', 'error'])('reads as far as the metadata, and lets go on %s', async (event) => {
		const created = keepCreated('video')
		const file = makeFile({ basename: 'clip #1.mp4', mime: 'video/mp4' })

		const preloading = preloadNeighbourMetadata(file)
		const [video] = created
		expect(video!.preload).toBe('metadata')
		expect(video!.getAttribute('src')).toBe(file.encodedSource)
		video!.dispatchEvent(new Event(event))
		await preloading

		expect(video!.hasAttribute('src')).toBe(false)
	})
})

describe('indexComesFirst', () => {
	it('finds the index before the data', () => {
		expect(indexComesFirst(isoBoxes(['ftyp', 24], ['moov', 1000], ['mdat', 5000]))).toBe(true)
	})

	it('finds the data before the index', () => {
		expect(indexComesFirst(isoBoxes(['ftyp', 24], ['mdat', 5000]))).toBe(false)
	})

	it('reads a 64-bit box size', () => {
		const bytes = isoBoxes(['ftyp', 24], ['free', 16], ['moov', 8])
		// The free box says 1, and gives its length in the 8 bytes after its type
		const view = new DataView(bytes.buffer)
		view.setUint32(24, 1)
		view.setBigUint64(32, 16n)
		expect(indexComesFirst(bytes)).toBe(true)
	})

	it('says nothing when the start read does not get that far', () => {
		expect(indexComesFirst(isoBoxes(['ftyp', 24], ['free', 8]).subarray(0, 28))).toBeUndefined()
		expect(indexComesFirst(isoBoxes(['ftyp', 24], ['free', 100_000]).subarray(0, 64 * 1024))).toBeUndefined()
	})
})

describe('hasIndexUpFront', () => {
	it('reads only the start of the file to find the index', async () => {
		const served = serve(isoBoxes(['ftyp', 24], ['moov', 1000], ['mdat', 5000]))

		expect(await hasIndexUpFront(makeFile({ basename: 'clip.mp4', mime: 'video/mp4' }))).toBe(true)
		expect(served.requests[0]!.headers).toEqual({ Range: 'bytes=0-65535' })
	})

	// A server that ignores the range sends the whole file: the read stops
	// at the cap all the same
	it('stops near the cap for a large file with its index at the end', async () => {
		const served = serve(isoBoxes(['ftyp', 24], ['mdat', 2 * 1024 * 1024], ['moov', 1000]))

		expect(await hasIndexUpFront(makeFile({ basename: 'film.mp4', mime: 'video/mp4' }))).toBe(false)
		expect(served.read).toBeLessThanOrEqual(64 * 1024 + 16 * 1024)
	})

	it('trusts formats that keep their metadata up front, without reading anything', async () => {
		const served = serve(new Uint8Array())

		expect(await hasIndexUpFront(makeFile({ basename: 'clip.webm', mime: 'video/webm' }))).toBe(true)
		expect(served.requests).toEqual([])
	})

	it('says no when the start cannot be read', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })))

		expect(await hasIndexUpFront(makeFile({ basename: 'clip.mp4', mime: 'video/mp4' }))).toBe(false)
	})
})

describe('preloadNeighbourVideo', () => {
	const space = { width: 800, height: 600 }

	it('fetches the preview, which is its poster and its size, and none of the video', async () => {
		const created = keepCreated('video')
		const served = serve(new Uint8Array())
		const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4', attributes: { hasPreview: true } })

		await preloadNeighbourVideo(file, space)

		expect(preloadImageSize).toHaveBeenCalledWith(getServerPreview(file, space))
		expect(served.requests).toEqual([])
		expect(created).toEqual([])
	})

	it('reads the metadata of one without a preview when the index comes first', async () => {
		const created = keepCreated('video')
		serve(isoBoxes(['ftyp', 24], ['moov', 1000], ['mdat', 5000]))

		const preloading = preloadNeighbourVideo(makeFile({ basename: 'clip.mp4', mime: 'video/mp4' }), space)
		await vi.waitFor(() => expect(created).toHaveLength(1))
		created[0]!.dispatchEvent(new Event('loadedmetadata'))
		await preloading
	})

	it('leaves one alone whose index is at the end', async () => {
		const created = keepCreated('video')
		serve(isoBoxes(['ftyp', 24], ['mdat', 200_000], ['moov', 1000]))

		await preloadNeighbourVideo(makeFile({ basename: 'film.mp4', mime: 'video/mp4' }), space)

		expect(created).toEqual([])
	})

	it.each([
		['with data saver on', () => stubSaveData(true), {}],
		['when it is end-to-end encrypted', () => {}, { 'e2ee-is-encrypted': 1 }],
	])('does nothing %s', async (_name, setup, attributes) => {
		setup()
		const created = keepCreated('video')
		const served = serve(new Uint8Array())

		await preloadNeighbourVideo(makeFile({ basename: 'clip.mp4', mime: 'video/mp4', attributes: { hasPreview: true, ...attributes } }), space)

		expect(preloadImageSize).not.toHaveBeenCalled()
		expect(served.requests).toEqual([])
		expect(created).toEqual([])
	})
})

describe('preloadNeighbourAudio', () => {
	it('reads the metadata of a sound that keeps it up front', async () => {
		const created = keepCreated('video')

		const preloading = preloadNeighbourAudio(makeFile({ basename: 'song.mp3', mime: 'audio/mpeg' }))
		await vi.waitFor(() => expect(created).toHaveLength(1))
		created[0]!.dispatchEvent(new Event('loadedmetadata'))
		await preloading
	})

	it('leaves alone an m4a whose index is at the end', async () => {
		const created = keepCreated('video')
		serve(isoBoxes(['ftyp', 24], ['mdat', 200_000], ['moov', 1000]))

		await preloadNeighbourAudio(makeFile({ basename: 'song.m4a', mime: 'audio/mp4' }))

		expect(created).toEqual([])
	})
})
