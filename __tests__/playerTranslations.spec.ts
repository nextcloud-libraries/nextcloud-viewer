/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { setLanguage, setLocale } from '@nextcloud/l10n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerI18n = vi.hoisted(() => vi.fn())
vi.mock('@videojs/html/i18n', () => ({ registerI18n }))

/**
 * Load a fresh copy of the module, for the language set by the test.
 */
async function importTranslations() {
	vi.resetModules()
	return await import('../lib/utils/playerTranslations.ts')
}

describe('the player translations', () => {
	beforeEach(() => {
		registerI18n.mockClear()
		setLanguage('en')
		setLocale('en')
	})

	// Video.js wants a BCP 47 tag, the server hands out `pt_BR`
	it('are registered once imported, for the user language as Video.js writes it', async () => {
		setLanguage('pt_BR')
		const { playerLanguage } = await importTranslations()

		expect(playerLanguage).toBe('pt-BR')
		expect(registerI18n).toHaveBeenCalledOnce()
		expect(registerI18n.mock.calls[0]![0]).toBe('pt-BR')
	})

	// Placeholders are filled in by Video.js, so they must survive our t()
	it('keep the placeholders Video.js fills in', async () => {
		await importTranslations()

		const translations = registerI18n.mock.calls[0]![1]
		expect(translations.buttons.play).toBe('Play')
		expect(translations.seek.forward).toContain('{seconds}')
		expect(translations.time.position).toBe('{current} of {duration}')
	})
})

describe('a playback rate', () => {
	it('is written as the user writes numbers', async () => {
		setLocale('de_DE')
		const { formatRate } = await importTranslations()

		expect(formatRate(1.5)).toBe('1,5×')
		expect(formatRate(2)).toBe('2×')
	})

	it('says normal at the normal speed', async () => {
		const { formatRate } = await importTranslations()

		expect(formatRate(1)).toBe('Normal')
	})
})
