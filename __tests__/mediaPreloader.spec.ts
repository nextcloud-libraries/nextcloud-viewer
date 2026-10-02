/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const axiosGet = vi.hoisted(() => vi.fn())
vi.mock('@nextcloud/axios', () => ({ default: { get: axiosGet } }))

import { makeFile } from './factories.ts'

const { preloadImage, preloadMedia, preloadPreview } = await import('../lib/services/mediaPreloader.ts')

describe('preloadPreview', () => {
	beforeEach(() => {
		axiosGet.mockReset()
		axiosGet.mockResolvedValue({ data: new Blob(['x'], { type: 'image/jpeg' }) })
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
	})

	it('says the request comes from the viewer', async () => {
		// Without this the server refuses the preview of a share that may
		// not be downloaded, and the element has nothing to show
		await preloadPreview('/core/preview?fileId=1')

		expect(axiosGet).toHaveBeenCalledWith(
			'/core/preview?fileId=1',
			expect.objectContaining({ headers: { 'x-nc-preview': 'true' } }),
		)
	})

	it('asks for the bytes rather than a parsed body', async () => {
		await preloadPreview('/core/preview?fileId=1')

		expect(axiosGet.mock.calls[0]![1].responseType).toBe('blob')
	})

	it('hands back something an element can be pointed at', async () => {
		expect(await preloadPreview('/core/preview?fileId=1')).toBe('blob:preview')
	})

	it('drops the request when the viewer moves on', async () => {
		const controller = new AbortController()
		await preloadPreview('/core/preview?fileId=1', controller.signal)

		expect(axiosGet.mock.calls[0]![1].signal).toBe(controller.signal)
	})

	it('lets a failure reach the caller, which reports it', async () => {
		axiosGet.mockRejectedValue(new Error('forbidden'))

		await expect(preloadPreview('/core/preview?fileId=1')).rejects.toThrow('forbidden')
	})
})

describe('preloadImage', () => {
	let decoded: { resolve: () => void, reject: (error: Error) => void }

	beforeEach(() => {
		// jsdom neither loads nor decodes images, and has no decode() at
		// all: the test says when it is done
		Object.defineProperty(HTMLImageElement.prototype, 'decode', {
			configurable: true,
			value: () => new Promise<void>((resolve, reject) => {
				decoded = { resolve, reject }
			}),
		})
		vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(4000)
	})

	afterEach(() => {
		delete (HTMLImageElement.prototype as { decode?: unknown }).decode
		vi.restoreAllMocks()
	})

	it('answers once the image is decoded, not merely loaded', async () => {
		const settled = vi.fn()
		const loading = preloadImage('/core/preview?fileId=1&x=8192&y=8192').then(settled)

		// Loaded is not enough: a large picture still takes a frame or two to
		// decode, and swapped in before that it stalls on screen
		await Promise.resolve()
		expect(settled).not.toHaveBeenCalled()

		decoded.resolve()
		await loading
		expect(settled).toHaveBeenCalledWith(4000)
	})

	it('fails when the image cannot be decoded', async () => {
		const loading = preloadImage('/core/preview?fileId=1')
		decoded.reject(new Error('EncodingError'))

		await expect(loading).rejects.toThrow('Could not load /core/preview?fileId=1')
	})

	it('gives up when the viewer moves on', async () => {
		const controller = new AbortController()
		const loading = preloadImage('/core/preview?fileId=1', controller.signal)
		controller.abort(new Error('moved on'))

		await expect(loading).rejects.toThrow('moved on')
	})
})

describe('preloadMedia', () => {
	beforeEach(() => {
		axiosGet.mockReset()
		axiosGet.mockResolvedValue({ data: new Blob(['x'], { type: 'video/mp4' }) })
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:media')
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	// Its source is already the full URL: the dav client put its own root in
	// front of it again, and the request never reached the file
	it('fetches the file from its own URL, as it is', async () => {
		const file = makeFile({ basename: 'clip #1.mp4', mime: 'video/mp4' })

		expect(await preloadMedia(file)).toBe('blob:media')
		expect(axiosGet).toHaveBeenCalledWith(file.encodedSource, expect.objectContaining({ responseType: 'blob' }))
	})
})
