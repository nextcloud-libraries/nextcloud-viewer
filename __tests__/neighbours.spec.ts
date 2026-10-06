/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const preloadImageSize = vi.hoisted(() => vi.fn(async () => ({ width: 640, height: 360 })))
vi.mock('../lib/services/mediaPreloader.ts', () => ({ preloadImageSize }))
const probeFile = vi.hoisted(() => vi.fn(async (): Promise<{ indexFirst: boolean } | undefined> => ({ indexFirst: true })))
vi.mock('../lib/utils/isoMedia.ts', async (importOriginal) => ({
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest importOriginal idiom
	...await importOriginal<typeof import('../lib/utils/isoMedia.ts')>(),
	probeFile,
}))

import {
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
	probeFile.mockClear()
})

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

describe('preloadNeighbourVideo', () => {
	const space = { width: 800, height: 600 }

	it('fetches the preview, which is its poster and its size, and none of the video', async () => {
		const created = keepCreated('video')
		const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4', attributes: { hasPreview: true } })

		await preloadNeighbourVideo(file, space)

		expect(preloadImageSize).toHaveBeenCalledWith(getServerPreview(file, space))
		expect(probeFile).not.toHaveBeenCalled()
		expect(created).toEqual([])
	})

	it('reads the size of an mp4 without a preview from its header, not its metadata', async () => {
		const created = keepCreated('video')
		const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4' })

		await preloadNeighbourVideo(file, space)

		expect(probeFile).toHaveBeenCalledWith(file)
		expect(created).toEqual([])
	})

	it('reads the metadata of a format that keeps it up front', async () => {
		const created = keepCreated('video')

		const preloading = preloadNeighbourVideo(makeFile({ basename: 'clip.webm', mime: 'video/webm' }), space)
		created[0]!.dispatchEvent(new Event('loadedmetadata'))
		await preloading

		expect(probeFile).not.toHaveBeenCalled()
	})

	it.each([
		['with data saver on', () => stubSaveData(true), {}],
		['when it is end-to-end encrypted', () => {}, { 'e2ee-is-encrypted': 1 }],
	])('does nothing %s', async (_name, setup, attributes) => {
		setup()
		const created = keepCreated('video')

		await preloadNeighbourVideo(makeFile({ basename: 'clip.mp4', mime: 'video/mp4', attributes: { hasPreview: true, ...attributes } }), space)

		expect(preloadImageSize).not.toHaveBeenCalled()
		expect(probeFile).not.toHaveBeenCalled()
		expect(created).toEqual([])
	})
})

describe('preloadNeighbourAudio', () => {
	it('reads the metadata of a sound that keeps it up front', async () => {
		const created = keepCreated('video')

		const preloading = preloadNeighbourAudio(makeFile({ basename: 'song.mp3', mime: 'audio/mpeg' }))
		created[0]!.dispatchEvent(new Event('loadedmetadata'))
		await preloading

		expect(probeFile).not.toHaveBeenCalled()
	})

	it('does nothing with data saver on', async () => {
		stubSaveData(true)
		const created = keepCreated('video')

		await preloadNeighbourAudio(makeFile({ basename: 'song.mp3', mime: 'audio/mpeg' }))

		expect(created).toEqual([])
	})

	it('reads the metadata of an m4a with its index first', async () => {
		const created = keepCreated('video')

		const preloading = preloadNeighbourAudio(makeFile({ basename: 'song.m4a', mime: 'audio/mp4' }))
		await vi.waitFor(() => expect(created).toHaveLength(1))
		created[0]!.dispatchEvent(new Event('loadedmetadata'))
		await preloading
	})

	it.each([
		['its index is at the end', { indexFirst: false }],
		['it could not be told where its index is', undefined],
	])('leaves alone an m4a when %s', async (_name, probe) => {
		probeFile.mockResolvedValueOnce(probe)
		const created = keepCreated('video')

		await preloadNeighbourAudio(makeFile({ basename: 'song.m4a', mime: 'audio/mp4' }))

		expect(created).toEqual([])
	})
})
