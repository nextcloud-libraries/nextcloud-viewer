/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { User } from '@nextcloud/e2e-test-server'
import type { APIRequestContext, Page } from '@playwright/test'

import { expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The credentials a dav request carries */
export function basic(user: User): string {
	return 'Basic ' + Buffer.from(`${user.userId}:${user.password}`).toString('base64')
}

/**
 * Sign the browser in.
 *
 * Through the form rather than the API, because what the tests need is a
 * session the page carries, and because it is the way somebody arrives at
 * a file in the first place.
 *
 * @param page the page
 * @param user the user to sign in as
 */
export async function signIn(page: Page, user: User): Promise<void> {
	await page.goto('/login')
	await page.locator('input[name="user"]').fill(user.userId)
	await page.locator('input[name="password"]').fill(user.password)
	await page.locator('form[name="login"] button[type="submit"]').click()
	await page.waitForURL(/\/apps\//)
}

/**
 * Put a file in the user's home.
 *
 * @param request the request context
 * @param user the owner
 * @param name the file name
 * @param mime what to upload it as
 * @param as the name to give it, the fixture's own by default
 */
export async function upload(request: APIRequestContext, user: User, name: string, mime: string, as = name): Promise<void> {
	const body = readFileSync(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)))
	const response = await request.put(`/remote.php/dav/files/${user.userId}/${as}`, {
		data: body,
		headers: {
			'Content-Type': mime,
			Authorization: basic(user),
		},
	})
	expect(response.status(), `uploading ${name}`).toBeLessThan(300)
}

/**
 * The id of a file at the top of a user's folder.
 *
 * @param request the request context
 * @param user the owner
 * @param name the file name
 */
export async function fileId(request: APIRequestContext, user: User, name: string): Promise<number> {
	const response = await request.fetch(`/remote.php/dav/files/${user.userId}/${name}`, {
		method: 'PROPFIND',
		headers: { Authorization: basic(user), Depth: '0', 'Content-Type': 'application/xml' },
		data: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>',
	})
	expect(response.status(), `finding ${name}`).toBe(207)
	const id = (await response.text()).match(/<oc:fileid>(\d+)<\/oc:fileid>/)?.[1]
	expect(id, `the id of ${name}`).toBeDefined()
	return Number(id)
}

/**
 * Open a file the way somebody would, by clicking it in the list.
 *
 * Not through `?openfile` on a cold load: the harness app's script is
 * added by an app rather than by core, so it can register the action
 * after the Files app has already read that query. On a real server the
 * viewer is registered from core and arrives in time. Clicking is the
 * path this suite is about anyway.
 *
 * @param page the page
 * @param name the file to open
 */
export async function openFromList(page: Page, name: string): Promise<void> {
	// Through the front controller: the server generates /index.php URLs, and
	// the Files router, based there, matches no view on the rewritten
	// /apps/files/ and never lists the folder
	await page.goto('/index.php/apps/files')
	const row = page.locator(`[data-cy-files-list-row-name="${name}"]`)
	await row.waitFor({ timeout: 30_000 })
	await row.locator('[data-cy-files-list-row-name-link]').click()
}
