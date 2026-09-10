/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFile } from '@nextcloud/files'

import { describe, expect, it, vi } from 'vitest'
import { logger } from '../lib/services/logger.ts'
import { canDownload } from '../lib/utils/canDownload.ts'

/**
 * A file carrying the given attributes, which is all this reads.
 *
 * @param attributes what the node knows about the share
 */
function file(attributes: Record<string, unknown>): IFile {
	return { attributes } as unknown as IFile
}

describe('canDownload', () => {
	it('allows a file that says nothing about downloading', () => {
		// Read permission was needed to open it at all
		expect(canDownload(file({}))).toBe(true)
	})

	it('refuses a file the share hides the download of', () => {
		expect(canDownload(file({ hideDownload: true }))).toBe(false)
	})

	it('refuses when a share attribute forbids it', () => {
		expect(canDownload(file({
			shareAttributes: [{ scope: 'permissions', key: 'download', value: false }],
		}))).toBe(false)
	})

	// The string comes off the wire, and one that does not parse is not an
	// empty list: it is a restriction that cannot be read, and this answer
	// decides whether the browser keeps its own ways of saving the file
	it('refuses a file whose share attributes cannot be read', () => {
		const logged = vi.spyOn(logger, 'error').mockImplementation(() => {})

		expect(canDownload(file({ shareAttributes: '[{"scope":"permi' }))).toBe(false)

		expect(logged).toHaveBeenCalled()
	})

	it('reads share attributes that arrive as a string', () => {
		// They come off the wire as JSON
		expect(canDownload(file({
			shareAttributes: '[{"scope":"permissions","key":"download","value":false}]',
		}))).toBe(false)
	})

	it('allows when the download attribute permits it', () => {
		expect(canDownload(file({
			shareAttributes: [{ scope: 'permissions', key: 'download', value: true }],
		}))).toBe(true)
	})

	it('only an explicit false forbids it', () => {
		// Anything else is not a refusal, and must not be read as one
		expect(canDownload(file({
			shareAttributes: [{ scope: 'permissions', key: 'download', value: null }],
		}))).toBe(true)
	})

	it('ignores attributes about something else', () => {
		expect(canDownload(file({
			shareAttributes: [{ scope: 'permissions', key: 'reshare', value: false }],
		}))).toBe(true)
	})

	it('copes with an empty attribute string', () => {
		expect(canDownload(file({ shareAttributes: '' }))).toBe(true)
	})

	it('copes with a file that has no attributes at all', () => {
		expect(canDownload({} as unknown as IFile)).toBe(true)
	})
})
