/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { Folder, Permission } from '@nextcloud/files'
import { describe, expect, it } from 'vitest'
import { canView, registerHandler } from '../lib/index.ts'
import { makeFile, makeHandler } from './factories.ts'

describe('canView', () => {
	it('is false while nothing is registered', () => {
		expect(canView(makeFile())).toBe(false)
	})

	it('is true for a file a handler takes', () => {
		registerHandler(makeHandler({ id: 'images', enabled: (nodes) => nodes.every((node) => node.mime === 'image/jpeg') }))

		expect(canView(makeFile({ mime: 'image/jpeg' }))).toBe(true)
		expect(canView(makeFile({ mime: 'video/mp4' }))).toBe(false)
	})

	it('is false for a folder, whatever the handlers say', () => {
		registerHandler(makeHandler({ id: 'everything', enabled: () => true }))

		const folder = new Folder({ id: 42, source: 'https://cloud.example.com/remote.php/dav/files/admin/holidays', root: '/files/admin', owner: 'admin' })

		expect(canView(folder)).toBe(false)
	})

	it('is false for a file the user cannot read', () => {
		registerHandler(makeHandler({ id: 'everything', enabled: () => true }))

		expect(canView(makeFile({ permissions: Permission.NONE }))).toBe(false)
	})

	it('needs one handler to take every node of a set', () => {
		registerHandler(makeHandler({ id: 'images', enabled: (nodes) => nodes.every((node) => node.mime === 'image/jpeg') }))
		registerHandler(makeHandler({ id: 'videos', enabled: (nodes) => nodes.every((node) => node.mime === 'video/mp4') }))

		const image = makeFile({ mime: 'image/jpeg' })
		const video = makeFile({ mime: 'video/mp4' })

		expect(canView([image, image])).toBe(true)
		expect(canView([image, video])).toBe(false)
	})
})
