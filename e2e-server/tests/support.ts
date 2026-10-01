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
 */
export async function upload(request: APIRequestContext, user: User, name: string, mime: string): Promise<void> {
	const body = readFileSync(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)))
	const response = await request.put(`/remote.php/dav/files/${user.userId}/${name}`, {
		data: body,
		headers: {
			'Content-Type': mime,
			Authorization: basic(user),
		},
	})
	expect(response.status(), `uploading ${name}`).toBeLessThan(300)
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
