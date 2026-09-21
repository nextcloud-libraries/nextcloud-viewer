/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

/**
 * The formats the image handler says every browser can decode, and the
 * size each fixture really is.
 *
 * Listing them is the point: the handler claims them, so something has to
 * open one of each and find a decoded picture rather than an empty frame.
 */
const BROWSER_FORMATS = [
	{ file: 'photo.avif', width: 320, height: 240 },
	{ file: 'picture.png', width: 120, height: 90 },
	{ file: 'picture.bmp', width: 120, height: 90 },
	{ file: 'picture.webp', width: 120, height: 90 },
	{ file: 'picture.ico', width: 32, height: 32 },
	{ file: 'picture.apng', width: 120, height: 90 },
]

test.describe('Formats the browser decodes itself', () => {
	for (const { file, width, height } of BROWSER_FORMATS) {
		test(`opens ${file} and paints it`, async ({ page }) => {
			const viewer = new ViewerPage(page)
			await viewer.open(file)
			await viewer.waitForOpen()

			// No preview stands behind these, so the engine either decoded
			// the file or there is nothing on screen. Its intrinsic size is
			// the answer to which.
			const image = viewer.container.locator('img').first()
			await expect(image).toBeVisible()
			await expect(async () => {
				const decoded = await image.evaluate((element: HTMLImageElement) => ({
					complete: element.complete,
					width: element.naturalWidth,
					height: element.naturalHeight,
				}))
				expect(decoded).toEqual({ complete: true, width, height })
			}).toPass({ timeout: 10_000 })
		})
	}
})
