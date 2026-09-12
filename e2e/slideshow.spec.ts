/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

test.describe('Viewer slideshow', () => {
	test('waits to be started', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		await expect(viewer.startSlideshowButton).toBeVisible()
		await expect(viewer.pauseSlideshowButton).toHaveCount(0)
	})

	// The real modal has to take the state from the viewer for this, so it
	// is what stands between the option and a button that says otherwise
	test('is running when opened with startSlideshow', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg', 'slideshow')
		await viewer.waitForOpen()

		await expect(viewer.pauseSlideshowButton).toBeVisible()

		// The button still works the other way round
		await viewer.pauseSlideshowButton.click()
		await expect(viewer.startSlideshowButton).toBeVisible()
	})
})
