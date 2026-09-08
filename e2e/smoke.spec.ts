/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'

test('opens a file whose source is a plain URL', async ({ page }) => {
	const errors: string[] = []
	page.on('pageerror', (error) => errors.push(String(error)))

	await page.goto('/')
	await page.getByRole('button', { name: 'photo.jpg' }).click()

	const modal = page.locator('.viewer__modal')
	await expect(modal).toBeVisible()
	await expect(modal.locator('.viewer__loading')).toHaveCount(0)
	// The image is served by the dev server, with no DAV and no previews
	// endpoint behind it
	await expect(modal.locator('img')).toBeVisible()
	expect(errors).toEqual([])
})
