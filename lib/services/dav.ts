/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile, IFolder } from '@nextcloud/files'
import type { FileStat, ResponseDataDetailed } from 'webdav'

import { FileType, sortNodes } from '@nextcloud/files'
import { getClient, getDefaultPropfind, resultToNode } from '@nextcloud/files/dav'
import { getSortingConfig } from './sortingConfig.ts'

export const client = getClient()

/**
 * The list is ordered the way the user has their files list ordered. Callers
 * that already have a list pass it to `open()` and keep their own order; only
 * `openFolder()` builds the list here, and it asks the files list how it is
 * sorted rather than assuming. Leaving the WebDAV order would step through the
 * files in whatever order the server happened to reply.
 *
 * @param folder - The folder whose file contents should be fetched
 * @param signal - Drops the listing when the viewer has moved on
 */
export async function fetchFolderContent(folder: IFolder, signal?: AbortSignal): Promise<IFile[]> {
	const propfindPayload = getDefaultPropfind()
	const result = (await client.getDirectoryContents(`${folder.root}${folder.path}`, {
		details: true,
		data: propfindPayload,
		signal,
	})) as ResponseDataDetailed<Array<FileStat>>

	const files = result.data
		.map((node) => resultToNode(node))
		.filter((node) => node.type === FileType.File)

	return sortNodes(files, await getSortingConfig()) as IFile[]
}
