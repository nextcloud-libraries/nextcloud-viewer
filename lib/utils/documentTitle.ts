/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** The page's own title, kept while the viewer borrows it */
let previousTitle: string | null = null

/**
 * The instance name to put the file name in front of.
 *
 * The theming app names the instance; without it, whatever the page was
 * called before the viewer opened stands in, so the title still reads as
 * belonging to this site rather than to nothing.
 */
function suffix(): string {
	const themed = (window as { OCA?: { Theming?: { name?: string } } }).OCA?.Theming?.name
	return themed ?? previousTitle ?? ''
}

/**
 * Put the shown file in the page title, so the tab and any bookmark say
 * what is being looked at.
 *
 * @param name the file being shown
 */
export function setViewerTitle(name: string): void {
	previousTitle ??= document.title
	const instance = suffix()
	document.title = instance ? `${name} - ${instance}` : name
}

/**
 * Give the page its own title back.
 */
export function restoreTitle(): void {
	if (previousTitle !== null) {
		document.title = previousTitle
		previousTitle = null
	}
}
