/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

// The order the playground lists them in, which is the order the viewer is
// handed and the order it has to step through. Images, video and audio
// share the 'media' group, so they page into each other, as people keep
// films, their posters and photos together
const MEDIA = [
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
	'video.mp4',
	'audio.mp3',
	'sound.wav',
	'sound-xwav.wav',
	'sound-vnd.wav',
	'sound.flac',
	'sound.ogg',
	'sound.webm',
	'sound.m4a',
	'sound.aac',
	'clip.webm',
	'trailer.webm',
	'trailer.jpg',
]

// No group, so the sheet music only pages among itself
const SHEET_MUSIC = ['score.musicxml', 'score.mxl']

test.describe('Viewer navigation', () => {
	test('steps through the list and loops around at both ends', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe('photo.jpg')

		// More than one file, so it offers somewhere to go
		await expect(viewer.nextButton).toBeVisible()
		await expect(viewer.previousButton).toBeVisible()

		for (const file of MEDIA.slice(1)) {
			await viewer.next()
			await viewer.waitForOpen()
			expect(await viewer.currentName()).toBe(file)
		}

		// Past the last file is the first again, and back past it the last
		await viewer.next()
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe(MEDIA[0])

		await viewer.previous()
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe(MEDIA.at(-1))
	})

	test('pages within the handler group and not across it', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open(SHEET_MUSIC[0]!)
		await viewer.waitForOpen()

		await viewer.next()
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe(SHEET_MUSIC[1])

		// Round the end of the sheet music, rather than on into the media
		await viewer.next()
		await viewer.waitForOpen()
		expect(await viewer.currentName()).toBe(SHEET_MUSIC[0])
	})
})
