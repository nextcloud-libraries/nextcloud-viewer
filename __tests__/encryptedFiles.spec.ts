/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { getFileActions } from '@nextcloud/files'
import { describe, expect, it, vi } from 'vitest'
import { canView, isHandlerEnabled, registerHandler } from '../lib/handlers.ts'
import { getHandlerForFile } from '../lib/helpers/handlerHelper.ts'
import { makeFile, makeHandler } from './factories.ts'

/**
 * The server decrypts an end-to-end encrypted file only on its WebDAV
 * endpoint. A handler fetching through an endpoint of its own would show
 * ciphertext, so it is never offered such a file.
 */
describe('an end-to-end encrypted file', () => {
	const encrypted = makeFile({ mime: 'text/markdown', attributes: { 'e2ee-is-encrypted': true } })
	const plain = makeFile({ mime: 'text/markdown', attributes: { 'e2ee-is-encrypted': false } })
	const unmarked = makeFile({ mime: 'text/markdown' })

	const custom = makeHandler({ id: 'custom', tagname: 'oca-viewer-custom' })
	const dav = makeHandler({ id: 'dav', tagname: 'oca-viewer-dav', supportsEndToEndEncryption: true })

	it('is refused by a handler that has not opted in, without asking it', () => {
		const enabled = vi.fn(() => true)

		expect(isHandlerEnabled(makeHandler({ enabled }), [encrypted])).toBe(false)
		expect(enabled).not.toHaveBeenCalled()
	})

	it('goes to a handler that reads it over dav', () => {
		expect(isHandlerEnabled(dav, [encrypted])).toBe(true)
	})

	it('taints a set: one encrypted file refuses the whole set', () => {
		expect(isHandlerEnabled(custom, [plain, encrypted])).toBe(false)
		expect(isHandlerEnabled(dav, [plain, encrypted])).toBe(true)
	})

	it('changes nothing for a file the attribute marks as not encrypted, or does not mark', () => {
		expect(isHandlerEnabled(custom, [plain])).toBe(true)
		expect(isHandlerEnabled(custom, [unmarked])).toBe(true)
	})

	it('is not viewable when only handlers without the flag take its mime', () => {
		registerHandler(custom)

		expect(canView(plain)).toBe(true)
		expect(canView(encrypted)).toBe(false)
		expect(getHandlerForFile(encrypted)).toBeUndefined()
	})

	it('skips to the handler that can read it', () => {
		registerHandler(custom)
		registerHandler(dav)

		expect(getHandlerForFile(plain)?.id).toBe('custom')
		expect(getHandlerForFile(encrypted)?.id).toBe('dav')
	})

	it('hides the "Open with" entry of a handler that cannot read it', () => {
		registerHandler(custom)
		registerHandler(dav)
		const ctx = { view: {} as never, folder: {} as never, contents: [] }
		const actionIds = (file: typeof encrypted) => getFileActions()
			.filter((action) => ['viewer-open', 'viewer-open-with-custom', 'viewer-open-with-dav'].includes(action.id))
			.filter((action) => action.enabled?.({ ...ctx, nodes: [file] }))
			.map((action) => action.id)
			.sort()

		expect(actionIds(plain)).toEqual(['viewer-open', 'viewer-open-with-custom', 'viewer-open-with-dav'])
		expect(actionIds(encrypted)).toEqual(['viewer-open', 'viewer-open-with-dav'])
	})
})

describe('the default handlers', () => {
	it('all read the file over dav or from a preview, so they take encrypted files', async () => {
		const { registerDefaultHandlers } = await import('../lib/defaults.ts')
		const { getHandlers } = await import('../lib/handlers.ts')
		registerDefaultHandlers()

		for (const id of ['images', 'videos', 'audios']) {
			expect(getHandlers().get(id)?.supportsEndToEndEncryption, id).toBe(true)
		}
	})
})
