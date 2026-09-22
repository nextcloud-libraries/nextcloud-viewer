/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

test.describe('Backdrop', () => {
	test('stays dark under a light theme', async ({ page }) => {
		const viewer = new ViewerPage(page)
		// The playground carries the server's default theming, which is the
		// light one: the viewer is dark regardless, because that is what a
		// photo or a video reads best against
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		await expect(page.locator('.modal-mask')).toBeVisible()
		await expect(page.locator('.modal-mask--light')).toHaveCount(0)
	})

	test('puts readable text on that dark backdrop', async ({ page }) => {
		// The test above checks the backdrop went dark and says nothing about
		// what sits on it. It did not: the header kept the light theme's
		// #222 and the title rendered at 1.32:1 against black, which is a
		// filename nobody can read.
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		const contrast = await page.evaluate(() => {
			const channel = (value: number) => {
				const part = value / 255
				return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
			}
			const luminance = (colour: string) => {
				const [red, green, blue] = colour.match(/\d+/g)!.slice(0, 3).map(Number).map(channel)
				return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
			}
			const name = document.querySelector('.viewer__modal .modal-header__name')!
			const front = luminance(getComputedStyle(name).color)
			const back = luminance(getComputedStyle(document.querySelector('.viewer__modal')!).backgroundColor)
			return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05)
		})

		// What WCAG asks of normal text
		expect(contrast).toBeGreaterThanOrEqual(4.5)
	})
})
