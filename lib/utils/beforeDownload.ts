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
 * Give the handler showing a file the chance to finish with it before it is
 * downloaded: to save edits not written yet, say. Dispatches `before-download`
 * on the handler's element and waits for what it handed `waitUntil()`.
 *
 * @param element - The handler's element, if one is shown
 * @param file - The file about to be downloaded
 * @return Whether the download can go ahead: not when the handler failed
 */
export async function prepareDownload(element: EventTarget | null | undefined, file: IFile): Promise<boolean> {
	if (!element) {
		return true
	}

	const pending: Promise<unknown>[] = []
	element.dispatchEvent(new CustomEvent<ViewerBeforeDownloadDetail>('before-download', {
		detail: {
			file,
			waitUntil: (promise) => {
				pending.push(promise)
			},
		},
	}))

	try {
		await Promise.all(pending)
		return true
	} catch (error) {
		logger.error('The handler could not get the file ready to download', { file, error })
		showError(t('Could not save "{name}" before downloading it', { name: file.displayname }))
		return false
	}
}
