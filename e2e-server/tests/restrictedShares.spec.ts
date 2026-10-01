/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { runOcc } from '@nextcloud/e2e-test-server/docker'
import { createRandomUser } from '@nextcloud/e2e-test-server/playwright'
import { expect, test } from '@playwright/test'
import { basic, openFromList, signIn, upload } from './support.ts'

/**
 * A share that forbids downloading, made the way the sharing UI makes it.
 *
 * The playground can only pretend this: it stubs the preview endpoint and
 * the node's attributes. Here the server builds the share, names the
 * restriction on the node, and decides what to serve, so a change on its
 * side to any of the three fails this.
 */
test.describe('A share that forbids downloading', () => {
	// With viewing without download allowed, the default, the server hands
	// such a file out anyway and there is nothing for the viewer to get
	// past. The restriction only bites once an admin turns that off.
	test.beforeAll(async () => {
		await runOcc(['config:app:set', 'core', 'shareapi_allow_view_without_download', '--value=false', '--type=boolean'])
	})

	test.afterAll(async () => {
		await runOcc(['config:app:delete', 'core', 'shareapi_allow_view_without_download'])
	})

	test('still shows the picture, through the preview the viewer asks for', async ({ page, request }) => {
		const owner = await createRandomUser()
		const recipient = await createRandomUser()
		await upload(request, owner, 'plain.jpg', 'image/jpeg')

		const share = await request.post('/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json', {
			headers: { Authorization: basic(owner), 'OCS-APIRequest': 'true' },
			form: {
				path: '/plain.jpg',
				shareType: '0',
				shareWith: recipient.userId,
				permissions: '1',
				attributes: JSON.stringify([{ scope: 'permissions', key: 'download', value: false }]),
			},
		})
		expect(share.status(), 'sharing the file').toBe(200)

		// The restriction is real: the file itself is refused to the recipient
		const download = await request.get(`/remote.php/dav/files/${recipient.userId}/plain.jpg`, {
			headers: { Authorization: basic(recipient) },
		})
		expect(download.status(), 'downloading the shared file').toBe(403)

		// Only the viewer sends the header, so a served request with it is the
		// viewer getting past the refusal
		const served: string[] = []
		page.on('response', (response) => {
			if (response.url().includes('/core/preview') && response.request().headers()['x-nc-preview'] === 'true' && response.ok()) {
				served.push(response.url())
			}
		})

		await signIn(page, recipient)
		await openFromList(page, 'plain.jpg')

		const image = page.locator('.viewer__modal img').first()
		await expect(async () => {
			const decoded = await image.evaluate((element: HTMLImageElement) => ({
				complete: element.complete,
				width: element.naturalWidth,
			}))
			expect(decoded.complete).toBe(true)
			expect(decoded.width).toBeGreaterThan(0)
		}).toPass({ timeout: 30_000 })
		expect(served.length, 'previews served to the viewer with x-nc-preview').toBeGreaterThan(0)
	})
})
