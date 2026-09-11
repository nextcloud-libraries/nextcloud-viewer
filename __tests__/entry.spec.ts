/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { scope } from '../lib/scope.ts'
import { version } from '../package.json'
import { makeFile } from './factories.ts'

// The entry does its work on import, so each test imports it fresh
async function importEntry() {
	vi.resetModules()
	return import('../lib/index.ts')
}

describe('importing @nextcloud/viewer', () => {
	it('offers this copy as the page viewer, under the package version', async () => {
		await importEntry()

		expect(scope.candidates).toHaveLength(1)
		expect(scope.candidates[0]!.version).toBe(version)
	})

	it('creates the shared service straight away', async () => {
		const { getViewer } = await importEntry()

		expect(scope.service).toBeDefined()
		expect(getViewer()).toBe(scope.service)
	})

	it('registers the image, video and audio handlers', async () => {
		const { getHandlers } = await importEntry()

		expect([...getHandlers().keys()].sort()).toEqual(['audios', 'images', 'videos'])
	})

	it('does not mount anything, or fetch its heavy half, until a file is opened', async () => {
		await importEntry()

		expect(document.getElementById('viewer')).toBeNull()
		expect(scope.implementation).toBeUndefined()
	})

	it('exposes the public API', async () => {
		const entry = await importEntry()

		expect(Object.keys(entry).sort()).toEqual([
			'Viewer',
			'canView',
			'getHandlers',
			'getViewer',
			'registerDefaultHandlers',
			'registerHandler',
		])
	})
})

describe('the offered implementation', () => {
	it('mounts the viewer into the page and hands it to the service', async () => {
		const { getViewer } = await importEntry()

		await scope.candidates[0]!.load()

		const root = document.getElementById('viewer')
		expect(root).not.toBeNull()
		// The built-in handlers' elements exist only once the viewer does
		expect(customElements.get('oca-viewer-image')).toBeDefined()
		expect(customElements.get('oca-viewer-video')).toBeDefined()
		expect(customElements.get('oca-viewer-audio')).toBeDefined()
		// The service is now backed by the mounted component: opening no longer needs a load
		const file = makeFile({ mime: 'image/png' })
		await expect(getViewer().open([file], file)).resolves.toBeUndefined()
		expect(root!.innerHTML).not.toBe('')

		// The real modal traps focus once its enter transition ends: wait for that
		// and close, so nothing of it fires after the document is torn down
		await vi.waitFor(() => expect(document.activeElement).not.toBe(document.body), { timeout: 5000 })
		getViewer().close()
		await flushPromises()
	// load() pulls in the whole implementation chunk, uncached: slow on CI
	}, 20_000)
})
