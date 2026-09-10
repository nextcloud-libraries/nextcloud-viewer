/**
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile } from '@nextcloud/files'

import { encodePath } from '@nextcloud/paths'
import { generateUrl } from '@nextcloud/router'
import { getSharingToken, isPublicShare } from '@nextcloud/sharing/public'

/**
 * @param file - The file to resolve a preview URL for
 * @return the preview url if the file have an existing preview or the absolute dav remote path if none.
 */
export function getPreviewIfAny(file: IFile): string {
	if (file.attributes.previewUrl) {
		return file.attributes.previewUrl
	}

	const searchParams = `fileId=${file.fileid}`
		+ `&x=${Math.floor(screen.width * devicePixelRatio)}`
		+ `&y=${Math.floor(screen.height * devicePixelRatio)}`
		+ '&a=true'
		// A dav etag is quoted, and it reaches us either way round depending on
		// who wrote it, so both forms go: what is left has to be the same
		// string whichever it came from, or the URL is a different one for
		// the same file and the preview is fetched again for nothing.
		+ (file.attributes.etag ? `&etag=${String(file.attributes.etag).replace(/&quot;|"/g, '')}` : '')

	if (file.attributes.hasPreview) {
		// TODO: find a nicer standard way of doing this?
		if (isPublicShare()) {
			return generateUrl(`/apps/files_sharing/publicpreview/${getSharingToken()}?file=${encodePath(file.basename)}&${searchParams}`)
		}
		return generateUrl(`/core/preview?${searchParams}`)
	}

	return file.source
}
