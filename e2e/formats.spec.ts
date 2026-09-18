/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

test.describe('Formats the browser decodes itself', () => {
	test('opens an AVIF and paints it', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.avif')
		await viewer.waitForOpen()

		// Listed as browser-supported, so no preview stands behind it: the
		// engine either decodes the file or the viewer shows nothing. Asking
		// the element for its intrinsic size is asking whether it decoded.
		const image = viewer.container.locator('img').first()
		await expect(image).toBeVisible()
		await expect(async () => {
			const decoded = await image.evaluate((element: HTMLImageElement) => ({
				complete: element.complete,
				width: element.naturalWidth,
				height: element.naturalHeight,
			}))
			expect(decoded).toEqual({ complete: true, width: 320, height: 240 })
		}).toPass({ timeout: 5000 })
	})
})
