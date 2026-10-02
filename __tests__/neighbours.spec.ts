/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { preloadNeighbourMetadata, preloadNeighbourPreview } from '../lib/utils/neighbours.ts'
import { getPreviewIfAny } from '../lib/utils/previewUtils.ts'
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
})

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
