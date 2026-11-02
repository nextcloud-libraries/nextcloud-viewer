/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { RangeReader } from '../lib/utils/matroska.ts'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assText, rangeReader, readClusterData, readCueReferences, readCueText, readMatroskaFile } from '../lib/utils/matroska.ts'

/**
 * Read a fixture the way the viewer reads a file: a range at a time.
 *
 * @param name - The fixture, in __tests__/fixtures or the playground
 */
function fixture(name: string): RangeReader {
	const path = name.endsWith('.webm')
		? join(import.meta.dirname, '../playground/public/remote.php/dav/files/playground', name)
		: join(import.meta.dirname, 'fixtures', name)
	const bytes = new Uint8Array(readFileSync(path))
	return async (start, length) => bytes.slice(start, start + length)
}

/**
 * Every cue of a file's subtitles, read through its index.
 *
 * @param name - The fixture
 */
async function cuesOf(name: string) {
	const read = fixture(name)
	const file = (await readMatroskaFile(read))!
	const cues = await readCueReferences(read, file)
	return Promise.all(cues.map(async (cue) => ({
		start: cue.start,
		end: cue.end,
		text: await readCueText(read, cue, file.tracks.find((track) => track.number === cue.track)!, await readClusterData(read, cue.cluster)),
	})))
}

// Muxed with mkvmerge 82 and ffmpeg 7 from the same two SubRip cues
const CUES = [
	{ start: 0, end: 1.5, text: 'Premier sous-titre' },
	{ start: 1.5, end: 3, text: 'Second sous-titre' },
]

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('the subtitles inside a Matroska file', () => {
	// mkvmerge writes the language as BCP 47 too, which is read first
	it('are its text tracks, with their language', async () => {
		const file = await readMatroskaFile(fixture('srt-plain.mkv'))

		expect(file!.tracks).toEqual([{ number: 2, name: undefined, language: 'en', format: 'text', encoding: undefined }])
	})

	it('are read through its index, cue by cue', async () => {
		expect(await cuesOf('srt-plain.mkv')).toEqual(CUES)
	})

	// mkvmerge compresses a track with --compression, and older versions did
	// it to every subtitle track by default
	it('are read from a track compressed with zlib, under its own name', async () => {
		const read = fixture('srt-zlib.mkv')
		const file = await readMatroskaFile(read)

		expect(file!.tracks[0]).toMatchObject({ name: 'Deutsch', language: 'de', encoding: { algorithm: 0 } })
		expect(await cuesOf('srt-zlib.mkv')).toEqual(CUES)
	})

	it('are read from WebM too, as WebVTT', async () => {
		const file = await readMatroskaFile(fixture('subtitled.webm'))

		expect(file!.tracks).toEqual([expect.objectContaining({ name: 'Français', language: 'fre', format: 'webm' })])
		expect(await cuesOf('subtitled.webm')).toEqual(CUES)
	})

	it('are none in a file that is not Matroska', async () => {
		const notMatroska: RangeReader = async (_start, length) => new Uint8Array(length)

		expect(await readMatroskaFile(notMatroska)).toBeUndefined()
	})
})

describe('a range of the file', () => {
	// What reading the subtitles this way is for: a server that ignores the
	// range would send the whole film
	it('is given up on when the server answers with the whole file', async () => {
		const cancel = vi.fn(async () => {})
		vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, body: { cancel } })))

		await expect(rangeReader('/movie.mkv')(0, 16)).rejects.toThrow('does not answer ranges')
		expect(cancel).toHaveBeenCalledOnce()
	})
})

describe('an ASS event', () => {
	it('is its text, without its fields and its styling', () => {
		expect(assText('3,0,Default,,0,0,0,,{\\i1}Bonjour,{\\i0} toi\\Nça va')).toBe('Bonjour, toi\nça va')
	})
})
