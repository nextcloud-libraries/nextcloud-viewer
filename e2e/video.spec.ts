/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

/**
 * The video the handler claims and both engines can decode.
 *
 * The rest of what it claims is listed as uncovered, with reasons, in
 * `__tests__/mimeCoverage.spec.ts`: containers whose contents decide
 * whether anything can play them, and codecs no engine here ships.
 */
const VIDEO = ['video.mp4', 'clip.webm']

test.describe('Video', () => {
	for (const file of VIDEO) {
		test(`plays ${file}`, async ({ page }) => {
			const viewer = new ViewerPage(page)
			await viewer.open(file)
			await viewer.waitForOpen()

			const video = viewer.container.locator('video').first()
			await expect(async () => {
				const state = await video.evaluate((element: HTMLVideoElement) => ({
					readyState: element.readyState,
					width: element.videoWidth,
					error: element.error?.code ?? null,
				}))
				expect(state.error).toBeNull()
				expect(state.readyState).toBeGreaterThan(0)
				expect(state.width).toBeGreaterThan(0)
			}).toPass({ timeout: 15_000 })
		})
	}
})
