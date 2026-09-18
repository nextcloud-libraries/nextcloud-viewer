/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const axiosGet = vi.hoisted(() => vi.fn())
vi.mock('@nextcloud/axios', () => ({ default: { get: axiosGet } }))
vi.mock('@nextcloud/files/dav', () => ({ getClient: () => ({ getFileContents: vi.fn() }) }))

const { preloadPreview } = await import('../lib/services/mediaPreloader.ts')

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
