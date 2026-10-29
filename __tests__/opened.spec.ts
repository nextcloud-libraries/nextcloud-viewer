/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { File } from '@nextcloud/files'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()
const isPublicShare = vi.fn(() => false)
const getCurrentUser = vi.fn<() => { uid: string } | null>(() => ({ uid: 'alice' }))
const logger = { debug: vi.fn(), warn: vi.fn() }

vi.mock('@nextcloud/axios', () => ({ default: { post } }))
vi.mock('@nextcloud/router', () => ({ generateOcsUrl: (url: string) => `/ocs/v2.php/${url}` }))
vi.mock('@nextcloud/sharing/public', () => ({ isPublicShare: () => isPublicShare() }))
vi.mock('@nextcloud/auth', () => ({ getCurrentUser: () => getCurrentUser() }))
vi.mock('../lib/services/logger.ts', () => ({ logger }))

const { reportOpened } = await import('../lib/services/opened.ts')

const file = new File({
	source: 'https://cloud.example.com/remote.php/dav/files/alice/a.jpg',
	root: '/files/alice',
	owner: 'alice',
	mime: 'image/jpeg',
	id: 42,
})

describe('reportOpened', () => {
	beforeEach(() => {
		post.mockReset().mockResolvedValue({})
		isPublicShare.mockReturnValue(false)
		getCurrentUser.mockReturnValue({ uid: 'alice' })
		logger.debug.mockReset()
		logger.warn.mockReset()
	})

	it('reports the file by its id', async () => {
		await reportOpened(file)

		expect(post).toHaveBeenCalledWith('/ocs/v2.php/apps/files/api/v1/opened', { fileId: 42 })
	})

	it('reports nothing for a guest', async () => {
		getCurrentUser.mockReturnValue(null)

		await reportOpened(file)
		expect(post).not.toHaveBeenCalled()
	})

	it('reports nothing on a public share page', async () => {
		isPublicShare.mockReturnValue(true)

		await reportOpened(file)
		expect(post).not.toHaveBeenCalled()
	})

	// Talk hands a logged-in user files it took from a share
	it('reports nothing for a file reached through a public share', async () => {
		const shared = new File({
			source: 'https://cloud.example.com/public.php/dav/files/abc/a.jpg',
			root: '/files/abc',
			owner: null,
			mime: 'image/jpeg',
			id: 42,
		})

		await reportOpened(shared)
		expect(post).not.toHaveBeenCalled()
	})

	// A server before 36, or a file the user cannot see: nothing to warn about
	it('only logs for debugging when the server answers 404', async () => {
		post.mockRejectedValue(Object.assign(new Error('Not found'), { response: { status: 404 } }))

		await expect(reportOpened(file)).resolves.toBeUndefined()
		expect(logger.debug).toHaveBeenCalledOnce()
		expect(logger.warn).not.toHaveBeenCalled()
	})

	it('warns, without failing, when the request fails otherwise', async () => {
		post.mockRejectedValue(new Error('offline'))

		await expect(reportOpened(file)).resolves.toBeUndefined()
		expect(logger.warn).toHaveBeenCalledOnce()
	})
})
