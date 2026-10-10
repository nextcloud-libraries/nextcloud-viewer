/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

test.describe('The viewer settings', () => {
	test('open from the button at the bottom, and list the shortcuts', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		await viewer.container.getByRole('button', { name: 'Viewer settings' }).click()
		const settings = page.locator('.app-settings')
		await expect(settings).toBeVisible()
		await expect(settings.getByText('Download')).toBeVisible()
		await expect(settings.locator('.vs__selected')).toHaveText('5 seconds')

		// Not before the dialog has taken the focus, which would close it again
		await expect(settings.locator(':focus')).toHaveCount(1)
		await settings.getByRole('combobox').click()
		// By its text: NcSelect splits a label in two to ellipsise its middle
		await page.getByRole('option').filter({ hasText: '10 seconds' }).click()
		await expect(settings.locator('.vs__selected')).toHaveText('10 seconds')
	})

	// The dialog sits over the viewer: Escape closes it, and only it
	test('open on ?, and close on Escape without closing the viewer', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		await page.keyboard.press('?')
		const settings = page.locator('.app-settings')
		await expect(settings).toBeVisible()
		// Escape goes to the dialog once it holds the focus
		await expect(settings.locator(':focus')).toHaveCount(1)

		await page.keyboard.press('Escape')
		await expect(settings).toHaveCount(0)
		await expect(viewer.container).toBeVisible()
	})
})
