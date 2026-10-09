/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

// A file that fails to load shows an error rather than a spinner for good
test('shows an error when the media fails to load', async ({ page }) => {
	await page.route('**/video.mp4', (route) => route.abort())

	const viewer = new ViewerPage(page)
	await viewer.open('video.mp4')

	await expect(viewer.container.locator('.viewer__error .empty-content__name')).toBeVisible()
	await expect(viewer.loading).toHaveCount(0)
})
