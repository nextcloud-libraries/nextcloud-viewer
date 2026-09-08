/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

test.describe('Backdrop', () => {
	test('stays dark under a light theme', async ({ page }) => {
		const viewer = new ViewerPage(page)
		// The playground carries the server's default theming, which is the
		// light one: the viewer is dark regardless, because that is what a
		// photo or a video reads best against
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		await expect(page.locator('.modal-mask')).toBeVisible()
		await expect(page.locator('.modal-mask--light')).toHaveCount(0)
	})
})
