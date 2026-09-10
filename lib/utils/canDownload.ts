/*!
 * SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFile } from '@nextcloud/files'

import { logger } from '../services/logger.ts'

interface ShareAttribute {
	value: unknown
	key: string
	scope: string
}

/**
 * The share attributes of a file, or undefined when they cannot be read.
 *
 * The server sends them as a json string, and a string that does not parse
 * is not an empty list: it is a restriction we cannot read.
 *
 * @param attributes - What the node carries, as a string or already parsed
 */
function parseShareAttributes(attributes?: string | ShareAttribute[]): ShareAttribute[] | undefined {
	if (typeof attributes !== 'string') {
		return attributes ?? []
	}

	try {
		return JSON.parse(attributes || '[]') as ShareAttribute[]
	} catch (error) {
		logger.error('Could not read the share attributes of a file', { attributes, error })
		return undefined
	}
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

	const shareAttributes = parseShareAttributes(attributes?.shareAttributes)
	if (shareAttributes === undefined) {
		// A restriction that cannot be read is still a restriction: the
		// answer this one guards is whether to leave the browser its own
		// ways of saving the file, so it is the restrictive one.
		return false
	}

	if (shareAttributes.length > 0) {
		const download = shareAttributes
			.find(({ scope, key }) => scope === 'permissions' && key === 'download')
		// Only an explicit false forbids it
		return download?.value !== false
	}

	// Otherwise it is allowed: the file needed read permission to be opened
	return true
}
