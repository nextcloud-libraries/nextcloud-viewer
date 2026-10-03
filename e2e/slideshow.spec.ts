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

	// A video slow to arrive used to be skipped: the time it took to load ran
	// down the slideshow delay, which is all it got (nextcloud/viewer#39)
	test('waits for a slow video to load and play to its end before moving on', async ({ page }) => {
		test.setTimeout(60_000)
		await page.route('**/video.mp4', async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 8000))
			await route.continue()
		})
		await page.addInitScript(() => {
			const ended: string[] = []
			;(window as unknown as { ended: string[] }).ended = ended
			document.addEventListener('ended', (event) => ended.push((event.target as HTMLMediaElement).currentSrc), true)
		})

		const viewer = new ViewerPage(page)
		// The file right before the video in the playground's list
		await viewer.open('protected.jpg', 'slideshow')
		await viewer.waitForOpen()
		await expect.poll(() => viewer.currentName(), { timeout: 15_000 }).toBe('video.mp4')

		// Not on to the next file until the video has played through
		await expect.poll(() => viewer.currentName(), { timeout: 30_000 }).not.toBe('video.mp4')
		const ended = await page.evaluate(() => (window as unknown as { ended: string[] }).ended)
		expect(ended.some((source) => source.endsWith('video.mp4'))).toBe(true)
	})
})
