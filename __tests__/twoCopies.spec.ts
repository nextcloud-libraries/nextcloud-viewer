import { flushPromises } from '@vue/test-utils'
/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scope } from '../lib/scope.ts'
import { makeFile } from './factories.ts'

/**
 * Load the package the way one more app bundle on the page would: its own
 * module instances, sharing nothing with the others but the window.
 */
async function importCopy() {
	vi.resetModules()
	return import('../lib/index.ts')
}

describe('two copies of the package on one page', () => {
	beforeEach(() => {
		scope.candidates.length = 0
		scope.implementation = undefined
		scope.service = undefined
		document.body.innerHTML = ''
	})

	it('hand out the same service', async () => {
		const first = await importCopy()
		const second = await importCopy()

		expect(scope.candidates).toHaveLength(2)
		expect(second.getViewer()).toBe(first.getViewer())
	})

	it('mount one viewer, the newer copy, however many of them open files', async () => {
		const first = await importCopy()
		const second = await importCopy()
		// Both copies came from this checkout: tell them apart the way two
		// apps pinning different releases would be
		const [older, newer] = scope.candidates
		newer!.version = '2.99.0'
		const olderLoad = vi.spyOn(older!, 'load')
		const newerLoad = vi.spyOn(newer!, 'load')
		first.registerDefaultHandlers()

		const file = makeFile({ mime: 'image/png' })
		await first.getViewer().open([file], file)
		await second.getViewer().open([file], file)

		expect(olderLoad).not.toHaveBeenCalled()
		expect(newerLoad).toHaveBeenCalledOnce()
		expect(document.querySelectorAll('#viewer')).toHaveLength(1)

		// The real modal traps focus once its enter transition ends: wait for
		// that and close, so nothing of it fires after the document is torn
		// down, as in entry.spec.ts
		await vi.waitFor(() => expect(document.activeElement).not.toBe(document.body), { timeout: 5000 })
		first.getViewer().close()
		await flushPromises()
	}, 30000)
})
