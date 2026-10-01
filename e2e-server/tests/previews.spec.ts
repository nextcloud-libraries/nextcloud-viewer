/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { User } from '@nextcloud/e2e-test-server'
import type { APIRequestContext } from '@playwright/test'

import { createRandomUser } from '@nextcloud/e2e-test-server/playwright'
import { expect, test } from '@playwright/test'
import { basic, openFromList, signIn, upload } from './support.ts'

/**
 * The formats that only a server can show.
 *
 * Nothing decodes any of these in a browser, so the viewer has nothing to
 * fall back on: either a provider rendered a preview or the frame is
 * empty. That is why they cannot be covered against the playground, and
 * why they are the ones worth paying for a container to test.
 */
const PREVIEW_FORMATS = [
	{ file: 'picture.tiff', mime: 'image/tiff' },
	{ file: 'picture.heic', mime: 'image/heic' },
	{ file: 'picture.jp2', mime: 'image/jp2' },
]

/**
 * Whether the server tells the page which preview providers it has.
 *
 * The library gates every format that needs a preview on this, so without
 * it none of them can be offered however well the server renders them. It
 * arrives with nextcloud/server#63954; until that lands there is nothing
 * for these tests to find, and saying so is more use than failing.
 *
 * @param request the request context
 * @param user a user to ask as
 */
async function reportsPreviewProviders(request: APIRequestContext, user: User): Promise<boolean> {
	const response = await request.get('/ocs/v2.php/cloud/capabilities?format=json', {
		headers: { Authorization: basic(user), 'OCS-APIRequest': 'true' },
	})
	const body = await response.json() as {
		ocs?: { data?: { capabilities?: { core?: { previews?: { enabled_providers?: string[] } } } } }
	}
	return Array.isArray(body?.ocs?.data?.capabilities?.core?.previews?.enabled_providers)
}

test.describe('A real server', () => {
	test('shows a file it rendered a preview for', async ({ page, request }) => {
		// Nothing gated about a jpeg, so this is the one that proves the
		// harness itself: a real upload, a real session, the library loaded
		// from its built package by an app, and a picture on screen
		const user = await createRandomUser()
		await upload(request, user, 'plain.jpg', 'image/jpeg')

		await signIn(page, user)
		await openFromList(page, 'plain.jpg')

		const image = page.locator('.viewer__modal img').first()
		await expect(image).toBeVisible({ timeout: 30_000 })
		await expect(async () => {
			const shown = await image.evaluate((element: HTMLImageElement) => ({
				complete: element.complete,
				width: element.naturalWidth,
			}))
			expect(shown.complete).toBe(true)
			expect(shown.width).toBeGreaterThan(0)
		}).toPass({ timeout: 30_000 })
	})
})

test.describe('Formats only the server can render', () => {
	for (const { file, mime } of PREVIEW_FORMATS) {
		test(`shows a ${mime} through the preview the server made`, async ({ page, request }) => {
			const user = await createRandomUser()
			test.skip(
				!await reportsPreviewProviders(request, user),
				'This server does not report its preview providers, so the library cannot offer a format that needs one (nextcloud/server#63954)',
			)
			await upload(request, user, file, mime)

			await signIn(page, user)
			await openFromList(page, file)

			const image = page.locator('.viewer__modal img').first()
			await expect(image).toBeVisible({ timeout: 30_000 })

			// A cold render can take a while, so the assertion is what the
			// element ends up holding rather than how fast it got there
			await expect(async () => {
				const shown = await image.evaluate((element: HTMLImageElement) => ({
					complete: element.complete,
					width: element.naturalWidth,
					height: element.naturalHeight,
					src: element.currentSrc,
				}))
				// Decoded, so the server really produced an image
				expect(shown.complete).toBe(true)
				expect(shown.width).toBeGreaterThan(0)
				expect(shown.height).toBeGreaterThan(0)
				// And it came from the preview endpoint, not from the file:
				// the browser cannot read any of these formats itself
				expect(shown.src).toContain('/core/preview')
			}).toPass({ timeout: 30_000 })
		})
	}
})
