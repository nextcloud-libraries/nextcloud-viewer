/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerHandler } from '../lib/handlers.ts'
import { scope } from '../lib/scope.ts'
import { logger } from '../lib/services/logger.ts'
import { makeHandler } from './factories.ts'

describe('registering a handler whose id is taken', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('quietly keeps the first when it is the same handler again', () => {
		// Several copies of the package on a page each register the
		// defaults: that is one handler, not a collision
		const warn = vi.spyOn(logger, 'warn')
		const first = makeHandler({ id: 'repeat', tagName: 'oca-viewer-repeat' })
		registerHandler(first)
		registerHandler(makeHandler({ id: 'repeat', tagName: 'oca-viewer-repeat' }))

		expect(scope.handlers!.get('repeat')).toBe(first)
		expect(warn).not.toHaveBeenCalled()
	})

	it('lets a second copy of the package register the defaults without a word', async () => {
		// The server registers them on every page, and an app bundling its
		// own copy for older servers asks again
		const { registerDefaultHandlers } = await import('../lib/defaults.ts')
		registerDefaultHandlers()
		vi.resetModules()
		const second = await import('../lib/defaults.ts')
		const { logger: secondLogger } = await import('../lib/services/logger.ts')
		const warn = vi.spyOn(secondLogger, 'warn')

		second.registerDefaultHandlers()

		expect(warn).not.toHaveBeenCalled()
	})
})
