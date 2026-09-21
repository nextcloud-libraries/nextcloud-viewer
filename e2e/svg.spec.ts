/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

/**
 * The svg the viewer showed, decoded back out of the element.
 *
 * An svg is the one image the viewer does not hand to the element as it
 * came: it is fetched, run through the sanitiser and given over as a data
 * URL. Reading that URL back is reading what the sanitiser produced.
 *
 * @param src the element's src attribute
 */
function decode(src: string): string {
	const encoded = src.replace(/^data:image\/svg\+xml;base64,/, '')
	return Buffer.from(encoded, 'base64').toString('utf8')
}

test.describe('SVG', () => {
	test('shows the drawing without what was smuggled in it', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('drawing.svg')
		await viewer.waitForOpen()

		const image = viewer.container.locator('img').first()
		await expect(image).toBeVisible()

		const src = await image.getAttribute('src')
		expect(src).toMatch(/^data:image\/svg\+xml;base64,/)
		const svg = decode(src!)

		// The drawing survives
		expect(svg).toContain('<circle')
		expect(svg).toContain('Sanitiser test drawing')

		// What an svg can be used to smuggle does not.
		//
		// Worth knowing what this does and does not prove: the viewer shows
		// an svg through an img element, and a browser will not run script
		// in one of those whatever it contains. So the sanitiser is not what
		// stops this file executing here, and a test asserting that nothing
		// ran passes just as well with the sanitiser taken out. What it does
		// is keep the markup from reaching anywhere it would run, which is
		// what these assertions check, and they do fail without it.
		expect(svg).not.toContain('<script')
		expect(svg).not.toContain('onload')
		expect(svg).not.toContain('onerror')
		expect(svg).not.toContain('__svgScriptRan')
	})
})
