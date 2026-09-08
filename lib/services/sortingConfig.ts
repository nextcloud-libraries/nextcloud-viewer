/*!
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { FilesSortingOptions } from '@nextcloud/files'

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { isPublicShare } from '@nextcloud/sharing/public'
import { logger } from './logger.ts'

/** What the files list falls back to, and so do we */
const DEFAULT: FilesSortingOptions = { sortingMode: 'basename', sortingOrder: 'asc' }

/** How the Files app names its sorting modes, where it differs from ours */
const MODES: Record<string, string> = { mtime: 'lastmod' }

/**
 * How the user has their files list sorted.
 *
 * The viewer pages through files in the order it was given, and the one
 * place it builds that order itself is a folder it fetched. Sorting that
 * by name would step through the folder in an order the user did not
 * choose and cannot see, so ask the files list how it is sorted.
 *
 * A public share has no such config, and neither does a request that
 * fails: both fall back to what the files list itself falls back to.
 */
export async function getSortingConfig(): Promise<FilesSortingOptions> {
	if (isPublicShare()) {
		return DEFAULT
	}

	try {
		const response = await axios.get(generateUrl('apps/files/api/v1/views'))
		const config = response.data?.ocs?.data?.files ?? response.data?.data?.files
		if (!config) {
			return DEFAULT
		}

		return {
			sortingMode: MODES[config.sorting_mode] ?? config.sorting_mode ?? DEFAULT.sortingMode,
			sortingOrder: config.sorting_direction === 'desc' ? 'desc' : 'asc',
		}
	} catch (error) {
		logger.debug('Could not read the files list sorting, falling back to name', { error })
		return DEFAULT
	}
}
