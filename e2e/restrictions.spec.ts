/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

/**
 * Whether the page let a right click through on the shown media.
 *
 * @param page the test page
 */
async function contextMenuAllowed(page: Page): Promise<boolean> {
	return await page.evaluate(() => {
		const target = document.querySelector('.viewer__modal .modal-container__content')
		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
		target?.dispatchEvent(event)
		return !event.defaultPrevented
	})
}

test.describe('Download restrictions', () => {
	test('refuses the context menu over a file that may not be downloaded', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('protected.jpg')
		await viewer.waitForOpen()

		// Hiding the download control is not enough: the browser's own menu
		// offers to save what is on screen
		expect(await contextMenuAllowed(page)).toBe(false)
	})

	test('leaves the context menu alone for a file that may be downloaded', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		expect(await contextMenuAllowed(page)).toBe(true)
	})
})
