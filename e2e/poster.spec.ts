/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

/**
 * A video with a picture of the same name beside it, which people keep
 * together to show the picture before the film plays and again once it
 * has: `trailer.webm` and `trailer.jpg` in the playground.
 */
test.describe('A video with a poster beside it', () => {
	test('shows the poster again once it has played, without downloading the video again', async ({ page }) => {
		// Served uncacheable, so that a reload of the element has to fetch
		// the file again, as Firefox did on every replay (nextcloud/viewer#2585).
		// A rewind plays on from what is already buffered
		const requests: string[] = []
		await page.route('**/trailer.webm', async (route) => {
			requests.push(route.request().url())
			const response = await route.fetch()
			await route.fulfill({ response, headers: { ...response.headers(), 'cache-control': 'no-store' } })
		})

		const viewer = new ViewerPage(page)
		await viewer.open('trailer.webm')
		await viewer.waitForOpen()

		// The skin's own poster, before it plays
		await expect(viewer.container.locator('.media-poster-image')).toHaveAttribute('src', /trailer\.jpg/)
		const poster = viewer.container.locator('.viewer-media__poster')

		// Played through to the end, muted so no autoplay policy stands in the way
		const video = viewer.container.locator('video').first()
		await video.evaluate(async (element: HTMLVideoElement) => {
			element.muted = true
			element.currentTime = 0
			const ended = new Promise((resolve) => element.addEventListener('ended', resolve, { once: true }))
			await element.play()
			await ended
		})

		// Back at the start and paused, with the poster on top again
		await expect(poster).toBeVisible()
		await expect(poster).toHaveAttribute('src', /trailer\.jpg/)
		const downloads = requests.length

		// Playing it again comes from what was already buffered
		await video.evaluate(async (element: HTMLVideoElement) => {
			const ended = new Promise((resolve) => element.addEventListener('ended', resolve, { once: true }))
			await element.play()
			await ended
		})
		await expect(poster).toBeVisible()
		expect(requests).toHaveLength(downloads)
	})
})
