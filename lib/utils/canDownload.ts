/*!
 * SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFile } from '@nextcloud/files'

interface ShareAttribute {
	value: unknown
	key: string
	scope: string
}

/**
 * Whether the file may be downloaded.
 *
 * A share can forbid it, and the viewer has to respect that beyond hiding
 * its own download control: the file is on screen, and the browser offers
 * its own ways of saving what is on screen.
 *
 * @param file the file to check
 */
export function canDownload(file: IFile): boolean {
	const attributes = file.attributes as {
		hideDownload?: boolean
		shareAttributes?: string | ShareAttribute[]
	}

	if (attributes?.hideDownload) {
		return false
	}

	const shareAttributes: ShareAttribute[] = typeof attributes?.shareAttributes === 'string'
		? JSON.parse(attributes.shareAttributes || '[]')
		: attributes?.shareAttributes ?? []

	if (shareAttributes.length > 0) {
		const download = shareAttributes
			.find(({ scope, key }) => scope === 'permissions' && key === 'download')
		// Only an explicit false forbids it
		return download?.value !== false
	}

	// Otherwise it is allowed: the file needed read permission to be opened
	return true
}
