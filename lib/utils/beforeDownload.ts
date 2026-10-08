/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFile } from '@nextcloud/files'
import type { ViewerBeforeDownloadDetail } from '../viewer.ts'

import { showError } from '@nextcloud/dialogs'
import { logger } from '../services/logger.ts'
import { t } from './l10n.ts'

/**
 * Give whoever is involved with a file the chance to finish with it before
 * it is downloaded: the handler showing it, to save edits not written yet,
 * say, its opener and any page listening to the viewer. Dispatches
 * `before-download` on each and waits for what they handed `waitUntil()`.
 *
 * @param targets - The handler's element, the opening and the viewer, where there are
 * @param file - The file about to be downloaded
 * @return Whether the download can go ahead: not when one of them failed
 */
export async function prepareDownload(targets: (EventTarget | null | undefined)[], file: IFile): Promise<boolean> {
	const pending: Promise<unknown>[] = []
	for (const target of targets) {
		target?.dispatchEvent(new CustomEvent<ViewerBeforeDownloadDetail>('before-download', {
			detail: {
				file,
				waitUntil: (promise) => {
					pending.push(promise)
				},
			},
		}))
	}

	try {
		await Promise.all(pending)
		return true
	} catch (error) {
		logger.error('The handler could not get the file ready to download', { file, error })
		showError(t('Could not save "{name}" before downloading it', { name: file.displayname }))
		return false
	}
}
