/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

// The order the playground lists them in, which is the order the viewer is
// handed and the order it has to step through
const IMAGES = ['photo.jpg', 'gradient.jpg', 'portrait.jpg', 'animation.gif', 'protected.jpg']

test.describe('Viewer navigation', () => {
	test('steps forward through the list and loops back to the first', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe('photo.jpg')

		// More than one file, so it offers somewhere to go
		await expect(viewer.nextButton).toBeVisible()
		await expect(viewer.previousButton).toBeVisible()

		for (const image of IMAGES.slice(1)) {
			await viewer.next()
			await viewer.waitForOpen()
			expect(await viewer.currentName()).toBe(image)
		}
	})

	test('steps backward from the first file to the last', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		await viewer.previous()
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe(IMAGES.at(-1))
	})

	test('pages within the handler group and not across it', async ({ page }) => {
		const viewer = new ViewerPage(page)
		// The video and audio handlers share the 'media' group, images are on
		// their own, so opening a video pages through the media and stops there
		await viewer.open('video.mp4')
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe('video.mp4')

		await viewer.next()
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe('audio.mp3')

		// Round the end of the media, rather than on into the images
		await viewer.next()
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe('video.mp4')
	})
})
