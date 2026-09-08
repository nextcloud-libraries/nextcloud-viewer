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
})
