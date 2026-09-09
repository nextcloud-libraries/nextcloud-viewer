/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { setLanguage } from '@nextcloud/l10n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Load a fresh copy of the l10n module, so that the gettext instance is
 * built for the language set by the test.
 */
async function importL10n() {
	vi.resetModules()
	return await import('../lib/utils/l10n.ts')
}

describe('translations', () => {
	beforeEach(() => {
		setLanguage('fr')
	})

	it('translates the strings shown before the viewer is loaded', async () => {
		const { t } = await importL10n()

		expect(t('View')).toBe('Afficher')
	})

	it('leaves the rest of the catalog to the viewer', async () => {
		const { loadTranslations, t } = await importL10n()

		// A string only the player shows, so importing the package must not
		// have paid for it
		expect(t('Settings')).toBe('Settings')

		await loadTranslations()
		expect(t('Settings')).toBe('Paramètres')
	})

	it('loads the full catalog once, however often it is asked for', async () => {
		const { loadTranslations } = await importL10n()

		const first = loadTranslations()
		const second = loadTranslations()

		expect(second).toBe(first)
		await first
	})
})
