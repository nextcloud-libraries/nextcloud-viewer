/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

// The order the playground lists them in, which is the order the viewer is
// handed and the order it has to step through
const IMAGES = [
	'photo.jpg',
	'gradient.jpg',
	'portrait.jpg',
	'photo.avif',
	'picture.png',
	'picture.bmp',
	'picture.webp',
	'picture.ico',
	'picture.apng',
	'drawing.svg',
	'animation.gif',
	'protected.jpg',
]

// The video and audio handlers share the 'media' group, so these page
// among themselves and never into the images
const MEDIA = [
	'video.mp4',
	'audio.mp3',
	'sound.wav',
	'sound-xwav.wav',
	'sound-vnd.wav',
	'sound.flac',
	'sound.ogg',
	'sound.webm',
	'sound.m4a',
]

test.describe('Viewer navigation', () => {
	test('steps through the list and loops around at both ends', async ({ page }) => {
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

		// Past the last file is the first again, and back past it the last
		await viewer.next()
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe(IMAGES[0])

		await viewer.previous()
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe(IMAGES.at(-1))
	})

	test('pages within the handler group and not across it', async ({ page }) => {
		const viewer = new ViewerPage(page)
		// Images are on their own, so opening a video pages through the
		// media and stops there
		await viewer.open(MEDIA[0]!)
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe(MEDIA[0])

		for (const file of MEDIA.slice(1)) {
			await viewer.next()
			await viewer.waitForOpen()
			expect(await viewer.currentName()).toBe(file)
		}

		// Round the end of the media, rather than on into the images
		await viewer.next()
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe(MEDIA[0])
	})
})
