/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'
import { ViewerPage } from './support/viewer.ts'

/** Longer than the composable waits before writing */
const AFTER_QUIET = 1600

/**
 * Read the Exif orientation of a JPEG, without the library that wrote it.
 *
 * Walking the block here rather than importing the reader keeps the
 * assertion independent of the code that produced the bytes: a writer and
 * a reader that agree with each other but with nothing else would pass.
 *
 * @param bytes the file to read
 */
function orientationOf(bytes: Buffer): number | null {
	if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
		return null
	}
	let at = 2
	while (at + 3 < bytes.length && bytes[at] === 0xFF) {
		const marker = bytes[at + 1]!
		// The scan carries the pixels and runs to the end of the file
		if (marker === 0xDA || marker === 0xD9) {
			return null
		}
		const length = bytes.readUInt16BE(at + 2)
		if (marker === 0xE1 && bytes.toString('latin1', at + 4, at + 10) === 'Exif\0\0') {
			const tiff = at + 10
			const little = bytes.toString('latin1', tiff, tiff + 2) === 'II'
			const u16 = (offset: number) => little ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset)
			const u32 = (offset: number) => little ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset)
			const start = tiff + u32(tiff + 4)
			const count = u16(start)
			for (let i = 0; i < count; i++) {
				const entry = start + 2 + i * 12
				if (u16(entry) === 0x0112) {
					return u16(entry + 8)
				}
			}
			return null
		}
		at += 2 + length
	}
	return null
}

/**
 * Hold every write to the fixtures and hand back the bodies.
 *
 * Nothing answers WebDAV behind the playground, so a write has to be
 * caught here or it is a 405 from a static file server.
 *
 * @param page the page to intercept on
 */
async function captureWrites(page: Page): Promise<Buffer[]> {
	const written: Buffer[] = []
	await page.route('**/remote.php/dav/**', async (route) => {
		if (route.request().method() !== 'PUT') {
			await route.fallback()
			return
		}
		const body = route.request().postDataBuffer()
		if (body) {
			written.push(body)
		}
		await route.fulfill({ status: 204, headers: { 'oc-etag': '"turned"' } })
	})
	return written
}

test.describe('Rotation', () => {
	test('offers a turn on a JPEG the user may write', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		await expect(viewer.container.getByRole('button', { name: 'Rotate left' })).toBeVisible()
	})

	test('does not offer one on a JPEG the user may only read', async ({ page }) => {
		const viewer = new ViewerPage(page)
		// The same format and the same handler: it is the permission that
		// differs, and a turn offered here could only fail on save
		await viewer.open('protected.jpg')
		await viewer.waitForOpen()

		await expect(viewer.container.getByRole('button', { name: 'Rotate left' })).toHaveCount(0)
	})

	test('does not offer one on a format that cannot keep it', async ({ page }) => {
		const viewer = new ViewerPage(page)
		await viewer.open('animation.gif')
		await viewer.waitForOpen()

		await expect(viewer.container.getByRole('button', { name: 'Rotate left' })).toHaveCount(0)
	})

	test('turns the picture before anything has been written', async ({ page }) => {
		await captureWrites(page)
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		await viewer.container.getByRole('button', { name: 'Rotate left' }).click()

		const image = viewer.container.locator('img').first()
		await expect(image).toHaveCSS('transform', 'matrix(0, -1, 1, 0, 0, 0)')
	})

	test('keeps a turned picture inside the frame', async ({ page }) => {
		// The regression this guards: a landscape photo fitted to a
		// landscape frame and then turned on its side is taller than the
		// frame unless the fit is worked out against the box it will
		// actually occupy. Rotating the element alone spills it over the
		// chrome above and below.
		await captureWrites(page)
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		const image = viewer.container.locator('img').first()
		const before = await image.boundingBox()
		expect(before!.width).toBeGreaterThan(before!.height)

		await viewer.container.getByRole('button', { name: 'Rotate left' }).click()

		const frame = await viewer.container.locator('.modal-container').boundingBox()
		await expect(async () => {
			const after = await image.boundingBox()
			// On its side now, and still within what holds it
			expect(after!.height).toBeGreaterThan(after!.width)
			expect(after!.height).toBeLessThanOrEqual(frame!.height + 1)
			expect(after!.width).toBeLessThanOrEqual(frame!.width + 1)
		}).toPass({ timeout: 5000 })
	})

	test('writes the new orientation to the file', async ({ page }) => {
		const written = await captureWrites(page)
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		await viewer.container.getByRole('button', { name: 'Rotate left' }).click()

		await expect(async () => {
			expect(written).toHaveLength(1)
		}).toPass({ timeout: AFTER_QUIET + 4000 })

		// The fixture carries no orientation, so one turn anticlockwise from
		// square is 8, "rotate 270 CW", which is what a reader is asked for
		expect(orientationOf(written[0]!)).toBe(8)
	})

	test('writes one turn for a run of them, not one each', async ({ page }) => {
		const written = await captureWrites(page)
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		const button = viewer.container.getByRole('button', { name: 'Rotate left' })
		await button.click()
		await button.click()

		await expect(async () => {
			expect(written).toHaveLength(1)
		}).toPass({ timeout: AFTER_QUIET + 4000 })

		// Two quarters anticlockwise is a half turn, which is 3
		expect(orientationOf(written[0]!)).toBe(3)
	})

	test('writes nothing for a picture turned the whole way round', async ({ page }) => {
		const written = await captureWrites(page)
		const viewer = new ViewerPage(page)
		await viewer.open('photo.jpg')
		await viewer.waitForOpen()

		const button = viewer.container.getByRole('button', { name: 'Rotate left' })
		for (let turn = 0; turn < 4; turn++) {
			await button.click()
		}
		await page.waitForTimeout(AFTER_QUIET)

		// The file is as it was. Writing it would make a version of a file
		// that did not change
		expect(written).toHaveLength(0)
	})
})
