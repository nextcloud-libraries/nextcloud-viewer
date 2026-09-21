/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

/**
 * The audio the handler claims and both engines can decode.
 *
 * `audio/aacp` is claimed and left out: Chromium answers `no` to it, so a
 * fixture would only record which engine is running. The three WAV names
 * are all here because a server may send any of them for the same file,
 * which is the whole of nextcloud-libraries/nextcloud-viewer#45.
 */
const AUDIO = [
	'audio.mp3',
	'sound.wav',
	'sound-xwav.wav',
	'sound-vnd.wav',
	'sound.flac',
	'sound.ogg',
	'sound.webm',
	'sound.m4a',
]

test.describe('Audio', () => {
	for (const file of AUDIO) {
		test(`plays ${file}`, async ({ page }) => {
			const viewer = new ViewerPage(page)
			await viewer.open(file)
			await viewer.waitForOpen()

			// Reaching metadata is the engine saying it understood the file.
			// An element that merely exists proves only that the handler
			// took the mime, which is the easy half.
			const audio = viewer.container.locator('audio').first()
			await expect(async () => {
				const state = await audio.evaluate((element: HTMLAudioElement) => ({
					readyState: element.readyState,
					duration: element.duration,
					error: element.error?.code ?? null,
				}))
				expect(state.error).toBeNull()
				expect(state.readyState).toBeGreaterThan(0)
				expect(state.duration).toBeGreaterThan(0)
			}).toPass({ timeout: 15_000 })
		})
	}
})
