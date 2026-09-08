/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

const IMAGE = readFileSync(fileURLToPath(new URL('../playground/media/gradient.jpg', import.meta.url)))

test.describe('Previews', () => {
	test('asks the previews endpoint for a file that has one', async ({ page }) => {
		const requests: string[] = []
		// There is no previews endpoint here, so stand in for one and record
		// what the viewer asked it for
		await page.route('**/core/preview*', async (route) => {
			requests.push(route.request().url())
			await route.fulfill({ contentType: 'image/jpeg', body: IMAGE })
		})

		const viewer = new ViewerPage(page)
		await viewer.open('previewed.jpg', 'previews')
		await viewer.waitForOpen()
		await expect(viewer.container.locator('img')).toBeVisible()

		expect(requests).toHaveLength(1)
		const url = new URL(requests[0]!)
		expect(url.searchParams.get('fileId')).toBe('2')
		// Sized to the screen, and asking for the real aspect ratio
		expect(Number(url.searchParams.get('x'))).toBeGreaterThan(0)
		expect(Number(url.searchParams.get('y'))).toBeGreaterThan(0)
		expect(url.searchParams.get('a')).toBe('true')
		// The etag makes the preview cacheable and busts it when the file changes
		expect(url.searchParams.get('etag')).toBe('etag-2')
	})

	test('loads the file itself when there is no preview', async ({ page }) => {
		let asked = false
		await page.route('**/core/preview*', async (route) => {
			asked = true
			await route.fulfill({ contentType: 'image/jpeg', body: IMAGE })
		})

		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()
		await expect(viewer.container.locator('img')).toBeVisible()

		// Nothing to ask for: the source is loaded directly
		expect(asked).toBe(false)
	})
})
