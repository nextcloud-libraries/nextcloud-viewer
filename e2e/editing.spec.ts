/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

test.describe('Editing', () => {
	test('offers to edit a file the user may write', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		await expect(viewer.container.getByRole('button', { name: 'Edit' })).toBeVisible()
	})

	test('does not offer to edit a file the user may only read', async ({ page }) => {
		const viewer = new ViewerPage(page)
		// Same handler, which can edit images: it is the file that cannot be
		// written, and an edit offered here only fails on save
		await viewer.open('animation.gif')
		await viewer.waitForOpen()

		await expect(viewer.container.getByRole('button', { name: 'Edit' })).toHaveCount(0)
	})

	// The editor is drawn over the modal, outside it, and the modal kept the
	// focus to itself: what was typed into the text tool landed on the
	// slideshow button, and the arrows paged away from the unsaved edit
	// (nextcloud/viewer#3335)
	test('lets text be typed into the editor, arrows included', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()
		await viewer.container.getByRole('button', { name: 'Edit' }).click()
		await expect(page.locator('[data-test="save"]')).toBeVisible()

		await page.getByRole('button', { name: 'Annotate' }).click()
		await page.getByRole('button', { name: 'Text' }).click()
		const canvas = page.locator('canvas').last()
		const box = (await canvas.boundingBox())!
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

		const field = page.locator('textarea')
		await expect(field).toBeFocused()
		await page.keyboard.type('Hello')
		await page.keyboard.press('ArrowLeft')
		await page.keyboard.type('!')
		await expect(field).toHaveValue('Hell!o')
		await page.keyboard.press('ArrowRight')

		await expect(page.locator('[data-test="save"]')).toBeVisible()
		expect(await viewer.currentName()).toBe('photo.jpg')
	})
})
