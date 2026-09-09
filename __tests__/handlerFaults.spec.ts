/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { getFileActions } from '@nextcloud/files'
import { describe, expect, it, vi } from 'vitest'
import { canView, registerHandler } from '../lib/handlers.ts'
import { getHandlerForFile } from '../lib/helpers/handlerHelper.ts'
import { logger } from '../lib/services/logger.ts'
import { makeFile, makeHandler } from './factories.ts'

/**
 * A handler that throws from `enabled()` is one bad line in one app. It must
 * not take the Files actions menu, or the viewer, down with it: the viewer
 * treats such a handler as not matching and says so in the console.
 */
describe('a handler whose enabled() throws', () => {
	const broken = makeHandler({
		id: 'broken',
		tagname: 'oca-viewer-broken',
		enabled: () => {
			throw new Error('boom')
		},
	})
	const fine = makeHandler({ id: 'fine', tagname: 'oca-viewer-fine' })
	const file = makeFile()

	it('is skipped when looking for the handler of a file', () => {
		registerHandler(broken)
		registerHandler(fine)
		const error = vi.spyOn(logger, 'error').mockImplementation(() => {})

		expect(getHandlerForFile(file)?.id).toBe('fine')
		expect(error).toHaveBeenCalledWith(expect.stringContaining('broken'), expect.objectContaining({ error: expect.any(Error) }))
	})

	it('does not decide canView on its own', () => {
		registerHandler(broken)
		vi.spyOn(logger, 'error').mockImplementation(() => {})

		expect(canView(file)).toBe(false)
	})

	it('does not stop another handler from making the file viewable', () => {
		registerHandler(broken)
		registerHandler(fine)
		vi.spyOn(logger, 'error').mockImplementation(() => {})

		expect(canView(file)).toBe(true)
	})

	it('keeps the Files actions usable', () => {
		registerHandler(broken)
		vi.spyOn(logger, 'error').mockImplementation(() => {})

		const ctx = { nodes: [file], view: {} as never, folder: {} as never, contents: [] }
		// The click-to-open action and the handler's own "Open with" entry;
		// entries of handlers from other tests stay registered in @nextcloud/files
		const actions = getFileActions().filter((action) => ['viewer-open', 'viewer-open-with-broken'].includes(action.id))
		expect(actions).toHaveLength(2)
		for (const action of actions) {
			expect(() => action.enabled?.(ctx)).not.toThrow()
			expect(action.enabled?.(ctx)).toBe(false)
		}
	})
})
