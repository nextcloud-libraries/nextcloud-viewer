/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stored = vi.hoisted(() => ({ value: null as { slideshow_delay: number, volume: number, muted: boolean } | null }))
const put = vi.hoisted(() => vi.fn())
const showError = vi.hoisted(() => vi.fn())
vi.mock('@nextcloud/initial-state', () => ({ loadState: (app: string, key: string, fallback: unknown) => (app === 'viewer' && key === 'config' ? stored.value : null) ?? fallback }))
vi.mock('@nextcloud/axios', () => ({ default: { put } }))
vi.mock('@nextcloud/dialogs', () => ({ showError }))

/**
 * The settings as a page with these stored settings sees them
 *
 * @param settings - What the server handed the page, nothing for a guest
 */
async function settingsWith(settings: { slideshow_delay: number, volume: number, muted: boolean } | null) {
	stored.value = settings
	vi.resetModules()
	const { useViewerSettings } = await import('../lib/composables/useViewerSettings.ts')
	return useViewerSettings()
}

/** What the server hands a user who never changed anything */
const STORED = { slideshow_delay: 5, volume: 100, muted: false }

beforeEach(() => {
	put.mockReset()
	put.mockResolvedValue({})
	showError.mockReset()
})

afterEach(() => {
	stored.value = null
})

describe('the slideshow delay', () => {
	it('is 5 seconds unless the user chose otherwise', async () => {
		expect((await settingsWith(null)).slideshowDelay.value).toBe(5)
		expect((await settingsWith({ ...STORED, slideshow_delay: 10 })).slideshowDelay.value).toBe(10)
	})

	it('is kept on the server', async () => {
		const settings = await settingsWith(STORED)

		await settings.setSlideshowDelay(20)

		expect(settings.slideshowDelay.value).toBe(20)
		expect(put).toHaveBeenCalledWith(expect.stringContaining('/ocs/v2.php/apps/viewer/api/v1/config/slideshow_delay'), { value: 20 })
	})

	// No settings handed over: a guest, or a server that keeps none
	it('is only kept on the page where there is nowhere to save it', async () => {
		const settings = await settingsWith(null)

		await settings.setSlideshowDelay(20)

		expect(settings.slideshowDelay.value).toBe(20)
		expect(put).not.toHaveBeenCalled()
	})

	it('goes back to what it was when it cannot be saved, and says so', async () => {
		put.mockRejectedValue(new Error('offline'))
		const settings = await settingsWith({ ...STORED, slideshow_delay: 10 })

		await settings.setSlideshowDelay(20)

		expect(settings.slideshowDelay.value).toBe(10)
		expect(showError).toHaveBeenCalledWith('Could not save your viewer settings')
	})
})

describe('the volume', () => {
	it('is full and not muted unless the user chose otherwise', async () => {
		const settings = await settingsWith(null)
		expect(settings.volume.value).toBe(100)
		expect(settings.muted.value).toBe(false)

		const chosen = await settingsWith({ ...STORED, volume: 40, muted: true })
		expect(chosen.volume.value).toBe(40)
		expect(chosen.muted.value).toBe(true)
	})

	it('is kept on the server, muted or not', async () => {
		const settings = await settingsWith(STORED)

		await settings.setVolume(40)
		await settings.setMuted(true)

		expect(put).toHaveBeenCalledWith(expect.stringContaining('/ocs/v2.php/apps/viewer/api/v1/config/volume'), { value: 40 })
		expect(put).toHaveBeenCalledWith(expect.stringContaining('/ocs/v2.php/apps/viewer/api/v1/config/muted'), { value: true })
	})
})
