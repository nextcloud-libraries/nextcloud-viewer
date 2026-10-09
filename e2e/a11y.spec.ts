/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

test('exposes the viewer as a dialog named after the file, with named controls', async ({ page }) => {
	const viewer = new ViewerPage(page)
	await viewer.open('gradient.jpg')
	await viewer.waitForOpen()

	await expect(page.getByRole('dialog', { name: 'gradient.jpg' })).toBeVisible()
	await expect(viewer.nextButton).toBeVisible()
	await expect(viewer.previousButton).toBeVisible()
	await expect(viewer.closeButton).toBeVisible()
})
