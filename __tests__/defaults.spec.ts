/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it, vi } from 'vitest'
import { scope } from '../lib/scope.ts'

/**
 * Load the package from scratch, the way a page that imports it does.
 */
async function importPackage() {
	vi.resetModules()
	return await import('../lib/index.ts')
}

describe('default handlers', () => {
	it('can be reached by importing one of the handler modules first', async () => {
		// Entering the graph anywhere but the entry used to hit the entry
		// mid-evaluation, and the handler it was about to register was not
		// initialised yet
		vi.resetModules()
		const { registerImageHandler } = await import('../lib/models/images.ts')

		registerImageHandler()

		expect(scope.handlers!.has('images')).toBe(true)
	})

	it('register once, however often they are asked for', async () => {
		const { registerDefaultHandlers } = await importPackage()
		const { logger } = await import('../lib/services/logger.ts')
		const warn = vi.spyOn(logger, 'warn')

		registerDefaultHandlers()
		registerDefaultHandlers()

		expect(scope.handlers!.size).toBe(3)
		expect(warn).not.toHaveBeenCalled()
	})
})
