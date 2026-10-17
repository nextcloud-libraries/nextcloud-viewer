import { expect, test } from '@playwright/test'
/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ViewerPage } from './support/viewer.ts'

const IMAGE = readFileSync(fileURLToPath(new URL('../playground/public/remote.php/dav/files/playground/gradient.jpg', import.meta.url)))

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

	// A guest of a Talk conversation, say: /core/preview only answers someone
	// logged in, and would refuse them with a 401
	test('shows a guest the file itself rather than asking a preview they cannot have', async ({ page }) => {
		const requests: string[] = []
		await page.route('**/core/preview*', async (route) => {
			requests.push(route.request().url())
			await route.fulfill({ status: 401 })
		})

		const viewer = new ViewerPage(page)
		await viewer.open('previewed.jpg', 'previews&guest')
		await viewer.waitForOpen()

		await expect(viewer.container.locator('img').first()).toHaveAttribute('src', /previewed\.jpg$/)
		expect(requests).toHaveLength(0)
	})

	// A guest of a Talk conversation opening a picture from the share Talk
	// keeps it in: the share's previews are the ones a guest can have
	test('asks a guest the preview of the share a file comes from', async ({ page }) => {
		const requests: string[] = []
		await page.route('**/apps/files_sharing/publicpreview/**', async (route) => {
			requests.push(route.request().url())
			await route.fulfill({ contentType: 'image/jpeg', body: IMAGE })
		})
		await page.route('**/core/preview*', (route) => route.fulfill({ status: 401 }))

		const viewer = new ViewerPage(page)
		await viewer.open('shared.jpg', 'shared&guest')
		await viewer.waitForOpen()
		await expect(viewer.container.locator('img').first()).toBeVisible()

		// Then its neighbour's, preloaded
		const url = new URL(requests[0]!)
		expect(url.pathname).toContain('/apps/files_sharing/publicpreview/sharetoken')
		expect(url.searchParams.get('file')).toBe('/shared.jpg')
	})

	// The same from the share's link, as Talk hands a guest a file in the
	// folder it shares with a conversation: found by its path in the share
	test('asks a guest the preview of the share a link points into', async ({ page }) => {
		const requests: string[] = []
		await page.route('**/apps/files_sharing/publicpreview/**', async (route) => {
			requests.push(route.request().url())
			await route.fulfill({ contentType: 'image/jpeg', body: IMAGE })
		})
		await page.route('**/core/preview*', (route) => route.fulfill({ status: 401 }))

		const viewer = new ViewerPage(page)
		await viewer.open('shared-link.jpg', 'shared&guest')
		await viewer.waitForOpen()
		await expect(viewer.container.locator('img').first()).toBeVisible()

		const url = new URL(requests[0]!)
		expect(url.pathname).toContain('/apps/files_sharing/publicpreview/linktoken')
		expect(url.searchParams.get('file')).toBe('/holiday/shared-link.jpg')
	})

	// Through the link, a file of a folder share downloads as a zip of the folder
	test('loads a guest the file a link points into from its WebDAV address', async ({ page }) => {
		const links: string[] = []
		await page.route('**/s/origtoken/**', async (route) => {
			links.push(route.request().url())
			await route.fulfill({ status: 404 })
		})
		await page.route('**/public.php/dav/files/origtoken**', async (route) => {
			if (route.request().method() === 'PROPFIND') {
				await route.fulfill({
					status: 207,
					contentType: 'application/xml',
					body: '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/public.php/dav/files/origtoken/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',
				})
				return
			}
			await route.fulfill({ contentType: 'image/jpeg', body: IMAGE })
		})

		const viewer = new ViewerPage(page)
		await viewer.open('shared-original.jpg', 'shared&guest')
		await viewer.waitForOpen()
		const image = viewer.container.locator('img').first()
		await expect(image).toBeVisible()

		expect(new URL(await image.getAttribute('src') ?? '', page.url()).pathname).toBe('/public.php/dav/files/origtoken/holiday/shared-original.jpg')
		expect(links).toEqual([])
	})

	test('asks for the preview by hand when the share forbids downloading', async ({ page }) => {
		// The server refuses a plain request for the preview of a share that
		// cannot be downloaded, and serves it when the request says it comes
		// from the viewer. An element cannot set that header on its own
		// request, so a refusal here has to be answered by fetching it.
		const requests: Array<{ fileId: string | null, header: string | undefined }> = []
		await page.route('**/core/preview*', async (route) => {
			const header = route.request().headers()['x-nc-preview']
			requests.push({ fileId: new URL(route.request().url()).searchParams.get('fileId'), header })
			if (header !== 'true') {
				await route.fulfill({ status: 403, contentType: 'text/plain', body: 'Forbidden' })
				return
			}
			await route.fulfill({ contentType: 'image/jpeg', body: IMAGE })
		})

		const viewer = new ViewerPage(page)
		await viewer.open('restricted.jpg', 'previews')
		await viewer.waitForOpen()

		// The picture is on screen, which it could not be without the retry
		const image = viewer.container.locator('img').first()
		await expect(image).toBeVisible()
		await expect(async () => {
			const decoded = await image.evaluate((element: HTMLImageElement) => ({
				complete: element.complete,
				width: element.naturalWidth,
			}))
			expect(decoded.complete).toBe(true)
			expect(decoded.width).toBeGreaterThan(0)
		}).toPass({ timeout: 10_000 })

		// Refused once as the element asked, then asked for again with the
		// header. Only this file's: the viewer also fetches the previews of
		// the files next to it, ahead of the user stepping to them
		const restricted = requests.find(({ header }) => header === 'true')?.fileId
		expect(requests.filter(({ fileId }) => fileId === restricted).map(({ header }) => header)).toEqual([undefined, 'true'])
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
