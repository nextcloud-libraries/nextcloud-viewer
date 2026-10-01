/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ViewerPage } from './support/viewer.ts'

const root = resolve(import.meta.dirname, '..')
// Inside the project, so the playground's dev server may serve it
const secondCopy = resolve(root, 'node_modules/.cache/viewer-second-copy')
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }

/**
 * Two apps on one page each bundle their own copy of the package. The
 * playground serves one from the sources; the other is a real build of the
 * package, as an app would ship it, with its own modules and chunks.
 */
test.describe('Two copies of the package on one page', () => {
	test.beforeAll(() => {
		test.setTimeout(180_000)
		try {
			// Development mode: a bundle of its own is all this needs, and the
			// production build also rolls up the type declarations, which
			// api-extractor refuses to do anywhere but in dist/
			execFileSync('npx', ['vite', '--mode', 'development', 'build', '--outDir', secondCopy, '--emptyOutDir'], { cwd: root, stdio: 'pipe' })
		} catch (error) {
			// The build's own output says why, the exit code does not
			const { stdout, stderr } = error as { stdout?: Buffer, stderr?: Buffer }
			throw new Error(`Building the second copy failed:\n${stdout?.toString().slice(-2000)}\n${stderr?.toString().slice(-2000)}`, { cause: error })
		}
	})

	test('mount one viewer, the newest copy\'s', async ({ page }) => {
		const warnings: string[] = []
		page.on('console', (message) => {
			if (message.type() === 'warning') {
				warnings.push(message.text())
			}
		})
		// The playground's own copy would fetch this to mount itself
		const ownMount: string[] = []
		page.on('request', (request) => {
			if (request.url().includes('/lib/mount.ts')) {
				ownMount.push(request.url())
			}
		})

		await page.goto('/')
		await page.evaluate((path) => import(/* @vite-ignore */ `/@fs${path}/index.mjs`), secondCopy)

		const candidates = await page.evaluate(() => window._nc_viewer_scope!.handlers_v2!.candidates.map((candidate) => candidate.version))
		expect(candidates).toEqual(['0.0.0-playground', version])

		// Opened from the playground's copy, shown by the built one
		const viewer = new ViewerPage(page)
		await page.getByRole('button', { name: 'photo.jpg' }).click()
		await viewer.waitForOpen()

		await expect(page.locator('#viewer')).toHaveCount(1)
		expect(ownMount).toEqual([])
		// 0.x beside 2.x: two majors, which the library names in the console
		expect(warnings.some((warning) => warning.includes('Incompatible versions'))).toBe(true)
	})
})
