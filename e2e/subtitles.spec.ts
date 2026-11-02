/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

/**
 * A video with its subtitles beside it, named like it as players find them:
 * `video.mp4` and `video.fr.vtt` in the playground.
 */
test.describe('A video with subtitles beside it', () => {
	test('lists them in its captions, and shows them once picked', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('video.mp4')
		await viewer.waitForOpen()

		const tracks = () => page.evaluate(() => [...document.querySelector('video')!.textTracks]
			.map((track) => ({ label: track.label, language: track.language, mode: track.mode })))
		await expect.poll(tracks).toEqual([{ label: 'French', language: 'fr', mode: 'disabled' }])

		await viewer.container.locator('media-captions-button').click()

		await expect.poll(tracks).toEqual([{ label: 'French', language: 'fr', mode: 'showing' }])
		await expect.poll(() => page.evaluate(() => {
			const cues = document.querySelector('video')!.textTracks[0]!.activeCues
			return cues?.length ? (cues[0] as VTTCue).text : null
		})).toBe('Bonjour, voici la bande-annonce')
	})
})
