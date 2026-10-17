/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { File } from '@nextcloud/files'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@nextcloud/axios', () => ({ default: { request } }))

const { isShareLink, publicShareOf, resolveShareLink } = await import('../lib/utils/publicShare.ts')

/**
 * A file at an address, as an app hands it to the viewer
 *
 * @param source - Its address
 * @param root - The part of the address it is relative to
 */
function file(source: string, root: string): File {
	return new File({ source, root, mime: 'image/jpeg', owner: null })
}

describe('the public share a file is in, from its WebDAV address', () => {
	it('is the one its address is under, with its path in the share', () => {
		expect(publicShareOf(file('https://cloud.example.com/public.php/dav/files/abc123/holiday/beach.jpg', '/files/abc123'))).toEqual({
			token: 'abc123',
			remoteURL: 'https://cloud.example.com/public.php/dav',
			path: '/holiday/beach.jpg',
		})
	})

	// A file shared alone is the share's root
	it('is the share itself for a file shared alone', () => {
		expect(publicShareOf(file('https://cloud.example.com/public.php/dav/files/abc123', '/files/abc123'))).toMatchObject({ token: 'abc123', path: '/' })
	})

	it('keeps a # or a ? in a name', () => {
		expect(publicShareOf(file('https://cloud.example.com/public.php/dav/files/abc123/a #1?.jpg', '/files/abc123'))?.path).toBe('/a #1?.jpg')
	})

	it('is under the address of a server in a subfolder', () => {
		expect(publicShareOf(file('https://example.com/nextcloud/public.php/dav/files/abc123/a.jpg', '/files/abc123'))?.remoteURL).toBe('https://example.com/nextcloud/public.php/dav')
	})

	it('is none for a user\'s file', () => {
		expect(publicShareOf(file('https://cloud.example.com/remote.php/dav/files/alice/a.jpg', '/files/alice'))).toBeUndefined()
	})
})

// The links Talk hands a guest (nextcloud-libraries/nextcloud-viewer#146):
// a share for each file, or one folder share for each user, in which a
// file at the top has no ?path= and one in a subfolder does
describe('the public share a file is in, from its link', () => {
	it.each([
		['a file shared alone, or at the top of a shared folder', 'https://cloud.example.com/index.php/s/abc123/download/beach.jpg', '/index.php/s/abc123', '/beach.jpg'],
		['a file in a subfolder of a shared folder', 'https://cloud.example.com/index.php/s/abc123/download/beach.jpg?path=/holiday', '/index.php/s/abc123', '/holiday/beach.jpg'],
		['a file named in the query', 'https://cloud.example.com/index.php/s/abc123/download?path=/holiday/&files=beach.jpg', '/index.php/s/abc123', '/holiday/beach.jpg'],
		['a link without index.php', 'https://cloud.example.com/s/abc123/download/beach.jpg', '/s/abc123', '/beach.jpg'],
		['the shared folder itself', 'https://cloud.example.com/index.php/s/abc123', '/index.php/s/abc123', '/'],
		['a subfolder of it', 'https://cloud.example.com/index.php/s/abc123?path=/holiday', '/index.php/s/abc123', '/holiday'],
	])('is found for %s', (_, source, root, path) => {
		expect(publicShareOf(file(source, root))).toEqual({
			token: 'abc123',
			remoteURL: 'https://cloud.example.com/public.php/dav',
			path,
		})
	})

	it('is under the address of a server in a subfolder', () => {
		expect(publicShareOf(file('https://example.com/nextcloud/index.php/s/abc123/download/a.jpg', '/nextcloud/index.php/s/abc123'))?.remoteURL).toBe('https://example.com/nextcloud/public.php/dav')
	})

	it('decodes the name', () => {
		expect(publicShareOf(file('https://cloud.example.com/index.php/s/abc123/download/beach%20day.jpg', '/index.php/s/abc123'))?.path).toBe('/beach day.jpg')
	})
})

describe('whether a file is given by its share\'s link', () => {
	it('is for a link', () => {
		expect(isShareLink(file('https://cloud.example.com/index.php/s/abc123/download/beach.jpg', '/index.php/s/abc123'))).toBe(true)
	})

	it.each([
		['a WebDAV address of a share', 'https://cloud.example.com/public.php/dav/files/abc123/beach.jpg', '/files/abc123'],
		['a user\'s file', 'https://cloud.example.com/remote.php/dav/files/alice/beach.jpg', '/files/alice'],
		// /s/ further down a WebDAV path is a folder named s
		['a folder named s in a share', 'https://cloud.example.com/public.php/dav/files/abc123/s/x', '/files/abc123'],
	])('is not for %s', (_, source, root) => {
		expect(isShareLink(file(source, root))).toBe(false)
	})
})

/**
 * The share answers a depth 0 PROPFIND on its root
 *
 * @param collection - Whether it is a folder
 */
function shareIs(collection: boolean): void {
	request.mockResolvedValueOnce({
		data: `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/public.php/dav/files/x</d:href><d:propstat><d:prop><d:resourcetype>${collection ? '<d:collection/>' : ''}</d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,
	})
}

// Each test uses its own token, as what a share is is kept for the page
describe('a file given by its share\'s link, at its WebDAV address', () => {
	beforeEach(() => {
		request.mockReset()
	})

	it('is the file in the share for a folder share', async () => {
		shareIs(true)
		const resolved = await resolveShareLink(file('https://cloud.example.com/index.php/s/folder1/download/beach.jpg?path=/holiday', '/index.php/s/folder1'))
		expect(resolved.source).toBe('https://cloud.example.com/public.php/dav/files/folder1/holiday/beach.jpg')
		expect(resolved.root).toBe('/files/folder1')
		expect(request).toHaveBeenCalledWith(expect.objectContaining({
			method: 'PROPFIND',
			url: 'https://cloud.example.com/public.php/dav/files/folder1',
			headers: { Depth: '0' },
		}))
	})

	it('is the share itself for a file shared alone', async () => {
		shareIs(false)
		const resolved = await resolveShareLink(file('https://cloud.example.com/index.php/s/single1/download/beach.jpg', '/index.php/s/single1'))
		expect(resolved.source).toBe('https://cloud.example.com/public.php/dav/files/single1')
	})

	it('keeps what is known of the file', async () => {
		shareIs(true)
		const linked = new File({
			id: 42,
			source: 'https://cloud.example.com/index.php/s/keep1/download/beach.jpg',
			root: '/index.php/s/keep1',
			displayname: 'Beach',
			mime: 'image/jpeg',
			owner: null,
			size: 1234,
			attributes: { 'has-preview': false },
		})
		const resolved = await resolveShareLink(linked)
		expect(resolved).toMatchObject({ fileid: 42, displayname: 'Beach', mime: 'image/jpeg', size: 1234 })
		expect(resolved.attributes['has-preview']).toBe(false)
	})

	it('asks each share once', async () => {
		shareIs(true)
		await resolveShareLink(file('https://cloud.example.com/index.php/s/once1/download/a.jpg', '/index.php/s/once1'))
		const resolved = await resolveShareLink(file('https://cloud.example.com/index.php/s/once1/download/b.jpg?path=/sub', '/index.php/s/once1'))
		expect(request).toHaveBeenCalledOnce()
		expect(resolved.source).toBe('https://cloud.example.com/public.php/dav/files/once1/sub/b.jpg')
	})

	it('is the link still when the share does not answer', async () => {
		request.mockRejectedValueOnce(new Error('401'))
		const linked = file('https://cloud.example.com/index.php/s/locked1/download/a.jpg', '/index.php/s/locked1')
		expect(await resolveShareLink(linked)).toBe(linked)
	})

	it('is any other file as it is, without asking', async () => {
		const dav = file('https://cloud.example.com/public.php/dav/files/abc123/a.jpg', '/files/abc123')
		expect(await resolveShareLink(dav)).toBe(dav)
		expect(request).not.toHaveBeenCalled()
	})
})
