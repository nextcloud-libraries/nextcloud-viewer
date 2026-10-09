/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

test.describe('The differences between two images', () => {
	test('show one over the other, and move with the slider', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await page.goto('/?compare=photo-edited.jpg,photo.jpg&view=differences')
		await viewer.waitForOpen()

		const images = viewer.container.locator('.image-differences__image')
		await expect(images).toHaveCount(2)
		await expect(images.nth(1)).toHaveCSS('clip-path', 'inset(0px 0px 0px 50%)')

		// The slider is a native range input: the arrow keys move it
		await viewer.container.locator('.image-differences__slider').focus()
		await page.keyboard.press('ArrowLeft')
		await expect(images.nth(1)).toHaveCSS('clip-path', 'inset(0px 0px 0px 49%)')
	})

	test('switch back to side by side, and again with D', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await page.goto('/?compare=photo-edited.jpg,photo.jpg&view=differences')
		await viewer.waitForOpen()

		await viewer.container.getByRole('button', { name: 'Show side by side' }).click()
		await expect(viewer.container.locator('.viewer__comparison oca-viewer-image')).toHaveCount(2)
		await expect(viewer.container.locator('.image-differences')).toHaveCount(0)

		await page.keyboard.press('d')
		await expect(viewer.container.locator('.image-differences')).toHaveCount(1)
	})
})
