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
	it('are registered by importing the package', async () => {
		await importPackage()

		expect([...scope.handlers!.keys()].sort()).toEqual(['audios', 'images', 'videos'])
	})

	it('do not complain about themselves when asked for explicitly', async () => {
		const { registerDefaultHandlers } = await importPackage()
		const { logger } = await import('../lib/services/logger.ts')
		const warn = vi.spyOn(logger, 'warn')

		registerDefaultHandlers()

		expect(warn).not.toHaveBeenCalled()
	})
})
