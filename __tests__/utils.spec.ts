/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { File as NcFile } from '@nextcloud/files'

import { File } from '@nextcloud/files'
import { isPublicShare } from '@nextcloud/sharing/public'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	findLivePhotoPeerFromFileId,
	findLivePhotoPeerFromName,
} from '../lib/utils/livePhotoUtils.ts'
import { getPreviewIfAny } from '../lib/utils/previewUtils.ts'
import { makeFile } from './factories.ts'

// generateUrl echoes the given path so we can assert on the built query string.
vi.mock('@nextcloud/router', () => ({
	generateUrl: vi.fn((url: string) => url),
}))

// Public share helpers used by previewUtils.
vi.mock('@nextcloud/sharing/public', () => ({
	isPublicShare: vi.fn(() => false),
	getSharingToken: vi.fn(() => 'share-token'),
}))

describe('previewUtils.getPreviewIfAny', () => {
	beforeEach(() => {
		vi.mocked(isPublicShare).mockReturnValue(false)
		// Deterministic viewport so the generated x/y params are stable.
		vi.stubGlobal('devicePixelRatio', 2)
		vi.stubGlobal('screen', { width: 1000, height: 800 })
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	/**
	 * Build a File with the attributes previewUtils reads.
	 *
	 * @param attributes - previewUrl / hasPreview / etag overrides
	 */
	function makeFileWithAttributes(attributes: Record<string, unknown>): NcFile {
		return new File({
			id: 99,
			source: 'https://cloud.example.com/remote.php/dav/files/admin/photo.jpg',
			root: '/files/admin',
			mime: 'image/jpeg',
			owner: 'admin',
			mtime: new Date('2024-01-01T00:00:00Z'),
			size: 1024,
			attributes,
		})
	}

	it('returns a pre-computed previewUrl attribute directly', () => {
		const file = makeFileWithAttributes({ previewUrl: '/direct/preview.png', hasPreview: true })
		expect(getPreviewIfAny(file)).toBe('/direct/preview.png')
	})

	it('builds a /core/preview URL when the file has a preview (private share)', () => {
		const file = makeFileWithAttributes({ hasPreview: true })
		const url = getPreviewIfAny(file)
		expect(url).toContain('/core/preview?')
		expect(url).toContain('fileId=99')
		expect(url).toContain('x=2000')
		expect(url).toContain('y=1600')
		expect(url).toContain('a=true')
	})

	// The server renders and caches one preview per size asked for, so a
	// picture shown in a corner of a HiDPI display must not have it render
	// the whole screen's worth of pixels
	it('asks for the space the preview has to fill', () => {
		const file = makeFileWithAttributes({ hasPreview: true })
		const url = getPreviewIfAny(file, { width: 400, height: 300 })
		// 400 and 300 CSS pixels at a ratio of 2, each rounded up to the
		// next shared size
		expect(url).toContain('x=1024')
		expect(url).toContain('y=768')
	})

	it('never asks for more than the display can show', () => {
		const file = makeFileWithAttributes({ hasPreview: true })
		const url = getPreviewIfAny(file, { width: 4000, height: 4000 })
		expect(url).toContain('x=2000')
		expect(url).toContain('y=1600')
	})

	it('rounds up to a shared size, so a resize reuses what the server has', () => {
		const file = makeFileWithAttributes({ hasPreview: true })
		const before = getPreviewIfAny(file, { width: 400, height: 300 })
		// A window a few pixels wider is the same request
		expect(getPreviewIfAny(file, { width: 405, height: 302 })).toBe(before)
	})

	it('strips &quot; entities from the etag param', () => {
		const file = makeFileWithAttributes({ hasPreview: true, etag: '&quot;abc123&quot;' })
		expect(getPreviewIfAny(file)).toContain('etag=abc123')
	})

	// A dav etag is quoted, and which of the two forms reaches the node
	// depends on who wrote it: both have to come out as the same string, or
	// the same file has two preview URLs and is fetched twice
	it('strips real quotes from the etag param too', () => {
		const file = makeFileWithAttributes({ hasPreview: true, etag: '"abc123"' })
		expect(getPreviewIfAny(file)).toContain('etag=abc123')
	})

	it('builds a public preview URL when on a public share', () => {
		vi.mocked(isPublicShare).mockReturnValue(true)
		const file = makeFileWithAttributes({ hasPreview: true })
		const url = getPreviewIfAny(file)
		expect(url).toContain('/apps/files_sharing/publicpreview/share-token')
		expect(url).toContain('file=photo.jpg')
	})

	it('falls back to the file source when there is no preview', () => {
		const file = makeFileWithAttributes({ hasPreview: false })
		expect(getPreviewIfAny(file)).toBe(file.source)
	})

	// What comes back is handed to a media element as its `src`, so a name
	// holding a `#` or a `?` has to be encoded or the URL is cut short.
	it('encodes the fallback source', () => {
		const file = makeFile({ basename: 'a#b c?.jpg', attributes: { hasPreview: false } })
		expect(getPreviewIfAny(file)).toBe(file.encodedSource)
		expect(getPreviewIfAny(file)).not.toContain('#')
	})
})

describe('livePhotoUtils.findLivePhotoPeerFromFileId', () => {
	it('finds the file whose fileid matches', () => {
		const a = makeFile({ id: 1 })
		const b = makeFile({ id: 2 })
		expect(findLivePhotoPeerFromFileId(2, [a, b])).toBe(b)
	})

	it('returns undefined when no file matches', () => {
		const a = makeFile({ id: 1 })
		expect(findLivePhotoPeerFromFileId(999, [a])).toBeUndefined()
	})
})

describe('livePhotoUtils.findLivePhotoPeerFromName', () => {
	it('pairs a video with the still image sharing its base name', () => {
		const video = makeFile({ id: 1, basename: 'IMG_1234.mov', mime: 'video/quicktime' })
		const photo = makeFile({ id: 2, basename: 'IMG_1234.jpg' })
		expect(findLivePhotoPeerFromName(video, [video, photo])).toBe(photo)
	})

	it('ignores non-image peers even with a matching name', () => {
		const video = makeFile({ id: 1, basename: 'IMG_1234.mov', mime: 'video/quicktime' })
		const other = makeFile({ id: 2, basename: 'IMG_1234.txt', mime: 'text/plain' })
		expect(findLivePhotoPeerFromName(video, [video, other])).toBeUndefined()
	})

	it('never returns the reference file itself', () => {
		const video = makeFile({ id: 1, basename: 'IMG_1234.mov', mime: 'video/quicktime' })
		expect(findLivePhotoPeerFromName(video, [video])).toBeUndefined()
	})

	it('accepts jpeg and png extensions', () => {
		const video = makeFile({ id: 1, basename: 'clip.mov', mime: 'video/quicktime' })
		const png = makeFile({ id: 2, basename: 'clip.png' })
		expect(findLivePhotoPeerFromName(video, [video, png])).toBe(png)
	})

	// The names have to match, not merely start alike: a camera fills a
	// folder with IMG_1234, IMG_1235, IMG_1239 and so on
	it('does not pair a video with the photo of another shot', () => {
		const video = makeFile({ id: 1, basename: 'IMG_1234.mov', mime: 'video/quicktime' })
		const other = makeFile({ id: 2, basename: 'IMG_1239.jpg' })
		expect(findLivePhotoPeerFromName(video, [video, other])).toBeUndefined()
	})

	it('pairs the still image back with its video', () => {
		const photo = makeFile({ id: 1, basename: 'IMG_1234.jpg' })
		const peer = makeFile({ id: 2, basename: 'IMG_1234.png' })
		expect(findLivePhotoPeerFromName(photo, [photo, peer])).toBe(peer)
	})

	it('reads the whole name of a file that has no extension', () => {
		const video = makeFile({ id: 1, basename: 'clip', mime: 'video/quicktime' })
		const longer = makeFile({ id: 2, basename: 'clips.jpg' })
		const exact = makeFile({ id: 3, basename: 'clip.jpg' })
		expect(findLivePhotoPeerFromName(video, [video, longer])).toBeUndefined()
		expect(findLivePhotoPeerFromName(video, [video, exact])).toBe(exact)
	})
})
