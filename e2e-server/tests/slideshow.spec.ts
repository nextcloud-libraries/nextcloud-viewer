/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { Page } from '@playwright/test'

import { createRandomUser } from '@nextcloud/e2e-test-server/playwright'
import { expect, test } from '@playwright/test'
import { basic, signIn, upload } from './support.ts'

/**
 * Start a slideshow of the selection from the Files list, wherever the
 * selection toolbar puts the action.
 *
 * @param page the page
 */
async function startSlideshowFromSelection(page: Page) {
	const inline = page.getByRole('button', { name: 'Start slideshow' })
	// The toolbar appears with the selection, and settles a moment later
	await page.waitForTimeout(500)
	if (await inline.isVisible()) {
		await inline.click()
		return
	}
	await page.locator('thead').getByRole('button', { name: 'Actions' }).click()
	await page.getByRole('menuitem', { name: 'Start slideshow' }).click()
}

/**
 * A slideshow of videos in the Files app, played one after the other like a
 * playlist (nextcloud/viewer#1524): each to its end before the next, rather
 * than cut off after the slideshow delay.
 *
 * Videos only: the server still bundles a copy whose image handler is not in
 * the media group with them, and the elected viewer keeps the handlers the
 * first copy registered, so pictures would not page into videos here yet.
 */
test.describe('A slideshow of files', () => {
	test('starts from a selection in Files, and plays each video to its end', async ({ page, request }) => {
		test.setTimeout(120_000)
		const user = await createRandomUser()
		await upload(request, user, 'clip.mp4', 'video/mp4', 'first.mp4')
		await upload(request, user, 'clip.mp4', 'video/mp4', 'second.mp4')
		await page.addInitScript(() => {
			const ended: string[] = []
			;(window as unknown as { ended: string[] }).ended = ended
			document.addEventListener('ended', (event) => ended.push((event.target as HTMLMediaElement).currentSrc), true)
		})
		await signIn(page, user)

		await page.goto('/index.php/apps/files')
		for (const name of ['first.mp4', 'second.mp4']) {
			const checkbox = page.getByRole('checkbox', { name: `Toggle selection for file "${name}"` })
			await checkbox.waitFor({ timeout: 30_000 })
			await checkbox.check({ force: true })
		}
		await startSlideshowFromSelection(page)

		const modal = page.locator('.viewer__modal')
		await expect(modal).toBeVisible({ timeout: 30_000 })
		await expect(modal.getByRole('button', { name: 'Pause slideshow' })).toBeVisible()

		const name = modal.locator('.modal-header__name')
		await expect(name).toHaveText('first.mp4')
		// On to the next one only once the first has played through
		await expect(name).toHaveText('second.mp4', { timeout: 30_000 })
		const ended = await page.evaluate(() => (window as unknown as { ended: string[] }).ended)
		expect(ended.some((source) => source.endsWith('first.mp4'))).toBe(true)
	})
})

test.describe('A slideshow of a folder', () => {
	test('starts from the Files list header when the folder is mostly media', async ({ page, request }) => {
		test.setTimeout(120_000)
		const user = await createRandomUser()
		const folder = await request.fetch(`/remote.php/dav/files/${user.userId}/album`, {
			method: 'MKCOL',
			headers: { Authorization: basic(user) },
		})
		expect(folder.status()).toBeLessThan(300)
		await upload(request, user, 'clip.mp4', 'video/mp4', 'album/first.mp4')
		await upload(request, user, 'clip.mp4', 'video/mp4', 'album/second.mp4')
		await signIn(page, user)

		await page.goto('/index.php/apps/files?dir=/album')
		await page.getByRole('row', { name: /first\.mp4/ }).waitFor({ timeout: 30_000 })
		const inline = page.getByRole('button', { name: 'Start slideshow' })
		if (await inline.isVisible()) {
			await inline.click()
		} else {
			// Folded into a menu next to the breadcrumbs when there are many
			await page.locator('.files-list__header').getByRole('button', { name: 'Actions' }).click()
			await page.getByRole('menuitem', { name: 'Start slideshow' }).click()
		}

		const modal = page.locator('.viewer__modal')
		await expect(modal).toBeVisible({ timeout: 30_000 })
		await expect(modal.getByRole('button', { name: 'Pause slideshow' })).toBeVisible()
		await expect(modal.locator('.modal-header__name')).toHaveText('first.mp4')
	})
})
