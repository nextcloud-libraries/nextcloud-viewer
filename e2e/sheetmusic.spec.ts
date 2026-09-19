/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

test.describe('Sheet music', () => {
	test('draws the score on screen', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('score.musicxml')
		await viewer.waitForOpen()

		// The renderer draws the staves as SVG, so asking whether anything
		// was drawn is asking what is inside that element. A handler that
		// opened and rendered nothing would still satisfy the modal being
		// visible.
		const sheet = viewer.container.locator('.sheetmusic__sheet')
		await expect(sheet.locator('svg')).toBeVisible()

		await expect(async () => {
			const drawn = await sheet.evaluate((element) => ({
				// Staff lines and note heads are drawn as paths
				paths: element.querySelectorAll('svg path').length,
				text: element.textContent ?? '',
			}))
			expect(drawn.paths).toBeGreaterThan(10)
			// The title comes from the file, so this is the score we asked for
			expect(drawn.text).toContain('Viewer test score')
		}).toPass({ timeout: 20_000 })
	})

	test('draws a compressed score too', async ({ page }) => {
		// A .mxl is the same score zipped, which is the form most editors
		// export, so the renderer is handed the bytes rather than text
		const viewer = new ViewerPage(page)
		await viewer.open('score.mxl')
		await viewer.waitForOpen()

		const sheet = viewer.container.locator('.sheetmusic__sheet')
		await expect(sheet.locator('svg')).toBeVisible()
		await expect(async () => {
			const drawn = await sheet.evaluate((element) => ({
				paths: element.querySelectorAll('svg path').length,
				text: element.textContent ?? '',
			}))
			expect(drawn.paths).toBeGreaterThan(10)
			expect(drawn.text).toContain('Viewer test score compressed')
		}).toPass({ timeout: 20_000 })
	})

	test('does not claim files it cannot draw', async ({ page }) => {
		// An earlier attempt at this registered application/octet-stream,
		// which is the type every unrecognised file falls back to
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		await expect(viewer.container.locator('.sheetmusic__sheet')).toHaveCount(0)
		await expect(viewer.container.locator('img')).toBeVisible()
	})
})
