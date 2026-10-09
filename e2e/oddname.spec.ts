/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { ODD_FIXTURES, oddFileName, oddFolderName } from '../playground/oddNames.ts'
import { ViewerPage } from './support/viewer.ts'

const DAV = '/remote.php/dav/files/playground'

for (const fixture of ODD_FIXTURES) {
	test(`opens a file with an odd name (${fixture.name})`, async ({ page }) => {
		const path = `${DAV}/${oddFolderName(fixture.name)}/${oddFileName(fixture.name)}`
		// Served only at the path escaped right: one escaped wrong 404s
		await page.route(`**${DAV}/**`, async (route) => {
			const pathname = decodeURIComponent(new URL(route.request().url()).pathname)
			if (pathname === path) {
				await route.fulfill({ path: fileURLToPath(new URL(`../playground/public${DAV}/${fixture.name}`, import.meta.url)) })
				return
			}
			await route.fallback()
		})

		const viewer = new ViewerPage(page)
		await viewer.open(oddFileName(fixture.name), 'oddnames')
		await viewer.waitForOpen()

		expect(await viewer.currentName()).toBe(oddFileName(fixture.name))
		await expect(viewer.container.locator(fixture.tagName)).toBeVisible()
		await expect(viewer.container.locator('.viewer__error')).toHaveCount(0)
	})
}
