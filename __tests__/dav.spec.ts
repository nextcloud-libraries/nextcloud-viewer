/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFolder } from '@nextcloud/files'

import { describe, expect, it, vi } from 'vitest'

const getDirectoryContents = vi.fn()

vi.mock('@nextcloud/files/dav', () => ({
	getClient: () => ({ getDirectoryContents }),
	getDefaultPropfind: () => '',
	resultToNode: (stat: { basename: string, type?: string }) => ({
		basename: stat.basename,
		type: stat.type ?? 'file',
		attributes: {},
	}),
}))

const { fetchFolderContent } = await import('../lib/services/dav.ts')

/**
 * A folder to fetch, the path of which the fake client ignores.
 */
function folder(): IFolder {
	return { root: '/files/user', path: '/photos' } as IFolder
}

describe('fetchFolderContent', () => {
	it('orders the files the way the Files app does, not the way the server replied', async () => {
		// WebDAV gives no ordering guarantee, so the reply order here is
		// deliberately neither sorted nor reversed. Natural order (2 before
		// 10) is the Files comparator's, not a plain string sort
		getDirectoryContents.mockResolvedValue({
			data: [{ basename: 'img10.jpg' }, { basename: 'img2.jpg' }, { basename: 'img1.jpg' }],
		})

		const files = await fetchFolderContent(folder())
		expect(files.map((file) => file.basename)).toEqual(['img1.jpg', 'img2.jpg', 'img10.jpg'])
	})

	it('drops the folders, which the viewer has nothing to show for', async () => {
		getDirectoryContents.mockResolvedValue({
			data: [{ basename: 'a.jpg' }, { basename: 'sub', type: 'folder' }],
		})

		const files = await fetchFolderContent(folder())
		expect(files.map((file) => file.basename)).toEqual(['a.jpg'])
	})
})
