/*!
 * SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ViewerProps } from '../viewer.ts'

import { computed, ref, watch } from 'vue'

/**
 * Composable to extract common viewer props.
 *
 * @param props The viewer props
 */
export function useViewerProps(props: ViewerProps) {
	const filename = computed(() => props.file.displayname)

	// Src is not a computed as we want to be able to change it on error.
	// Use the encoded source so special characters in the name don't break the
	// media element's `src` URL.
	const src = ref(props.file.encodedSource)

	// Update the src when the file changes. Watching the source rather than
	// the name: two files can be shown under one name (a version of a file
	// reads as a date, a rename keeps the same node) and it is the source
	// that says which bytes to fetch.
	watch(() => props.file.encodedSource, (source) => {
		src.value = source
	})

	return {
		filename,
		src,
	}
}
