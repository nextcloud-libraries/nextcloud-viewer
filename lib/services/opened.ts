/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFile } from '@nextcloud/files'

import { getCurrentUser } from '@nextcloud/auth'
import axios, { isAxiosError } from '@nextcloud/axios'
import { generateOcsUrl } from '@nextcloud/router'
import { isPublicShare } from '@nextcloud/sharing/public'
import { publicShareOf } from '../utils/publicShare.ts'
import { logger } from './logger.ts'

/**
 * Tell the server the user opened a file, so apps like recommendations
 * know what they work with. Reading a file says nothing about that: sync
 * clients and previews read files all the time.
 *
 * Only a user's own files: a guest or a file reached through a public
 * share has no file id the user could open. Opening is never held up by
 * it, and a server before 36 has no such endpoint.
 *
 * @param file - The file the viewer was asked to open
 */
export async function reportOpened(file: IFile): Promise<void> {
	if (getCurrentUser() === null || isPublicShare() || publicShareOf(file) || file.fileid === undefined) {
		return
	}

	try {
		await axios.post(generateOcsUrl('apps/files/api/v1/opened'), { fileId: file.fileid })
	} catch (error) {
		if (isAxiosError(error) && error.response?.status === 404) {
			logger.debug('The server does not know this file or how to report opening it', { file, error })
			return
		}
		logger.warn('Could not report the file as opened', { file, error })
	}
}
