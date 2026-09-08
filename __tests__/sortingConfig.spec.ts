/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const isPublicShare = vi.fn(() => false)

vi.mock('@nextcloud/axios', () => ({ default: { get } }))
vi.mock('@nextcloud/router', () => ({ generateUrl: (url: string) => `/index.php/${url}` }))
vi.mock('@nextcloud/sharing/public', () => ({ isPublicShare: () => isPublicShare() }))

const { getSortingConfig } = await import('../lib/services/sortingConfig.ts')

describe('getSortingConfig', () => {
	beforeEach(() => {
		get.mockReset()
		isPublicShare.mockReturnValue(false)
	})

	it('reads how the files list is sorted', async () => {
		get.mockResolvedValue({ data: { ocs: { data: { files: { sorting_mode: 'size', sorting_direction: 'desc' } } } } })

		await expect(getSortingConfig()).resolves.toEqual({ sortingMode: 'size', sortingOrder: 'desc' })
	})

	it('translates the mtime mode the files list uses', async () => {
		get.mockResolvedValue({ data: { ocs: { data: { files: { sorting_mode: 'mtime', sorting_direction: 'asc' } } } } })

		// The files list calls it mtime, nodes carry it as lastmod
		await expect(getSortingConfig()).resolves.toEqual({ sortingMode: 'lastmod', sortingOrder: 'asc' })
	})

	it('falls back to names ascending when the config says nothing', async () => {
		get.mockResolvedValue({ data: { ocs: { data: { files: {} } } } })

		await expect(getSortingConfig()).resolves.toEqual({ sortingMode: 'basename', sortingOrder: 'asc' })
	})

	it('asks nothing on a public share, which has no such config', async () => {
		isPublicShare.mockReturnValue(true)

		await expect(getSortingConfig()).resolves.toEqual({ sortingMode: 'basename', sortingOrder: 'asc' })
		expect(get).not.toHaveBeenCalled()
	})

	it('falls back rather than failing when the request does', async () => {
		get.mockRejectedValue(new Error('nope'))

		await expect(getSortingConfig()).resolves.toEqual({ sortingMode: 'basename', sortingOrder: 'asc' })
	})
})
