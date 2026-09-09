/*!
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 */

/**
 * The Files app's router, present only when the viewer runs inside the
 * Files app. Everything reading this treats it as optional.
 */
interface OCPFilesRouter {
	name?: string
	query?: Record<string, string | (string | null)[] | null | undefined>
	params?: Record<string, string>
	goToRoute: (
		name: string | null,
		params?: Record<string, string>,
		query?: Record<string, string | (string | null)[] | null | undefined>,
		replace?: boolean,
	) => void
}

declare global {
	/** This package's version, replaced at build time. */
	const __VIEWER_VERSION__: string

	/** Every string of the library in every locale, replaced at build time. */
	const __TRANSLATIONS__: import('./utils/l10n.ts').Catalog[]

	/** Only the strings the entry itself shows, replaced at build time. */
	const __TRANSLATIONS_EAGER__: import('./utils/l10n.ts').Catalog[]

	interface Window {
		OCP?: {
			Files?: {
				Router?: OCPFilesRouter
			}
		}
	}
}

export {}
