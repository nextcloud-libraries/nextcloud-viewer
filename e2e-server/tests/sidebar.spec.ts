/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { Page } from '@playwright/test'

import { createRandomUser } from '@nextcloud/e2e-test-server/playwright'
import { expect, test } from '@playwright/test'
import { fileId, openFromList, signIn, upload } from './support.ts'

/** The class the viewer puts on the page while the sidebar is shown beside it */
const SIDEBAR_FULLSCREEN = /viewer--sidebar-fullscreen/

/**
 * The Files sidebar on a real server, next to the viewer.
 *
 * The Files app only says so when its sidebar opens. One already open when
 * the viewer opens, or restored from the URL along with the file, is never
 * announced, which is what these are about: the viewer has to notice it,
 * make room for it, and keep it on the file shown.
 */
test.describe('The Files sidebar beside the viewer', () => {
	/**
	 * Open the sidebar from the viewer's actions, wherever they put it.
	 *
	 * @param page the page
	 */
	async function openSidebarFromViewer(page: Page) {
		const modal = page.locator('.viewer__modal')
		const inline = modal.getByRole('button', { name: 'Open sidebar' })
		if (await inline.isVisible()) {
			await inline.click()
			return
		}
		await modal.getByRole('button', { name: 'Actions' }).click()
		await page.getByRole('menuitem', { name: 'Open sidebar' }).click()
	}

	test('is made room for when it was open before the viewer, and follows the files', async ({ page, request }) => {
		const user = await createRandomUser()
		await upload(request, user, 'plain.jpg', 'image/jpeg', 'a.jpg')
		await upload(request, user, 'plain.jpg', 'image/jpeg', 'b.jpg')
		const id = await fileId(request, user, 'a.jpg')
		await signIn(page, user)

		// The details open first, as a link or a reload restores them
		await page.goto(`/index.php/apps/files/files/${id}?dir=/&opendetails=true`)
		const sidebar = page.locator('aside.app-sidebar')
		await expect(sidebar).toBeVisible({ timeout: 30_000 })
		await expect(sidebar).toContainText('a.jpg')

		await page.locator('[data-cy-files-list-row-name="a.jpg"] [data-cy-files-list-row-name-link]').click()
		const modal = page.locator('.viewer__modal')
		await expect(modal).toBeVisible({ timeout: 30_000 })

		// Beside it, rather than over it
		await expect(page.locator('body')).toHaveClass(SIDEBAR_FULLSCREEN)
		const [sidebarBox, modalBox] = await Promise.all([sidebar.boundingBox(), modal.boundingBox()])
		expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(sidebarBox!.x + 1)

		// And on the file shown, as the user pages
		await modal.getByRole('button', { name: 'Next' }).click()
		await expect(sidebar).toContainText('b.jpg')
	})

	test('is opened from the viewer, and given its place back when the viewer closes', async ({ page, request }) => {
		const user = await createRandomUser()
		await upload(request, user, 'plain.jpg', 'image/jpeg')
		await signIn(page, user)
		await openFromList(page, 'plain.jpg')
		const modal = page.locator('.viewer__modal')
		await expect(modal).toBeVisible({ timeout: 30_000 })

		await openSidebarFromViewer(page)
		const sidebar = page.locator('aside.app-sidebar')
		await expect(sidebar).toBeVisible()
		await expect(sidebar).toContainText('plain.jpg')
		await expect(page.locator('body')).toHaveClass(SIDEBAR_FULLSCREEN)
		await expect(page).toHaveURL(/opendetails/)

		await modal.getByRole('button', { name: 'Close' }).click()
		await expect(modal).toBeHidden()

		// Still open, back in its place in the Files app
		await expect(sidebar).toBeVisible()
		await expect(page.locator('body')).not.toHaveClass(SIDEBAR_FULLSCREEN)
	})
})
