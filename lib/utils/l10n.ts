/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { GettextTranslationBundle } from '@nextcloud/l10n/gettext'

import { getGettextBuilder } from '@nextcloud/l10n/gettext'

/** One locale's parsed po file, as gettext-parser returns it */
export interface Catalog {
	locale: string
	json: GettextTranslationBundle
}

interface Gettext {
	/**
	 * Get translated string (singular form), optionally with placeholders
	 *
	 * @param original original string to translate
	 * @param placeholders map of placeholder key to value
	 */
	gettext(original: string, placeholders?: Record<string, string | number>): string

	/**
	 * Get translated string with plural forms
	 *
	 * @param singular Singular text form
	 * @param plural Plural text form to be used if `count` requires it
	 * @param count The number to insert into the text
	 * @param placeholders optional map of placeholder key to value
	 */
	ngettext(singular: string, plural: string, count: number, placeholders?: Record<string, string | number>): string
}

/**
 * Build a gettext instance for the user's locale out of the given catalogs.
 *
 * @param catalogs - The parsed po files to translate from
 */
function build(catalogs: Catalog[]): Gettext {
	const builder = getGettextBuilder().detectLocale()
	catalogs.forEach(({ locale, json }) => builder.addTranslation(locale, json))
	return builder.build() as Gettext
}

// Importing the package only ever shows the handful of strings its file
// actions are named after, so that is all it carries. Anything else
// translates to itself until the full catalog is in.
let gt = build(__TRANSLATIONS_EAGER__)

let loading: Promise<void> | undefined

/**
 * Load the rest of the catalog and translate from it from then on.
 *
 * Called by the viewer as it mounts, before anything renders. Repeated
 * calls share the one fetch.
 */
export function loadTranslations(): Promise<void> {
	loading ??= import('./translations.ts').then(({ translations }) => {
		gt = build(translations)
	})
	return loading
}

// Bound through the current instance rather than to it, so that strings
// looked up after the full catalog lands come out translated.
export const t: Gettext['gettext'] = (original, placeholders) => gt.gettext(original, placeholders)
export const n: Gettext['ngettext'] = (singular, plural, count, placeholders) => gt.ngettext(singular, plural, count, placeholders)
