/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

test.describe('Page title', () => {
	test('names the file being looked at, and gives the title back on close', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await page.goto('/')
		const before = await page.title()

		await page.getByRole('button', { name: 'photo.jpg' }).click()
		await viewer.waitForOpen()
		await expect(page).toHaveTitle(/^photo\.jpg/)

		// Paging retitles too, rather than going stale on the first file
		await viewer.next()
		await viewer.waitForOpen()
		await expect(page).toHaveTitle(/^gradient\.jpg/)

		await viewer.closeButton.click()
		await expect(page).toHaveTitle(before)
	})
})

test.describe('Full screen', () => {
	test('is offered in the menu', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		// It is a menu entry rather than an inline action: only the edit
		// button sits in the header
		await viewer.container.getByRole('button', { name: 'Actions' }).click()
		await expect(page.getByRole('menuitem', { name: 'Full screen' })).toBeVisible()
	})
})
