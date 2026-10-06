/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ViewerPage } from './support/viewer.ts'

// Portrait, unlike the video, so a player shaped like it was sized from it
const PREVIEW = readFileSync(fileURLToPath(new URL('../playground/public/remote.php/dav/files/playground/portrait.jpg', import.meta.url)))

/**
 * A video slow to arrive used to show nothing but the spinner until it
 * could play, and a slideshow skipped it with only its poster shown
 * (nextcloud-libraries/nextcloud-viewer#104, nextcloud/viewer#39).
 */
test.describe('A video slow to load', () => {
	test('shows its player at once, with its preview, at the size of the preview', async ({ page }) => {
		await page.route('**/core/preview*', (route) => route.fulfill({ contentType: 'image/jpeg', body: PREVIEW }))
		// Held back until the end of the test
		let release!: () => void
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		await page.route('**/previewed.webm', async (route) => {
			await held
			await route.continue()
		})

		const viewer = new ViewerPage(page)
		await viewer.open('previewed.webm', 'previews')
		await viewer.waitForOpen()

		// Its poster is on the element; the player copies it onto its own layer in
		// its own time, which Firefox puts off while the video is held
		const video = viewer.container.locator('video')
		await expect(video).toHaveAttribute('poster', /core\/preview/)
		const box = (await video.boundingBox())!
		expect(box.width / box.height).toBeCloseTo(320 / 480, 1)

		release()
	})

	test('shows its player at once without a preview, at the size its header gives', async ({ page }) => {
		// Only the few bytes the viewer reads for the size get through: the
		// element's own requests are held until the end of the test
		let release!: () => void
		const held = new Promise<void>((resolve) => {
			release = resolve
		})
		await page.route('**/video.mp4', async (route) => {
			if (route.request().headers().range !== 'bytes=0-4095') {
				await held
			}
			await route.continue()
		})

		const viewer = new ViewerPage(page)
		await viewer.open('video.mp4')
		await viewer.waitForOpen()

		const box = (await viewer.container.locator('video').boundingBox())!
		expect(box.width / box.height).toBeCloseTo(640 / 360, 1)

		release()
	})
})
