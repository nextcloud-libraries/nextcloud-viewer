/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { RangeReader } from '../lib/utils/rangeReader.ts'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assText, cueMarkup, readClusterData, readCueReferences, readCueText, readMatroskaFile } from '../lib/utils/matroska.ts'
import { RangeReader as Reader } from '../lib/utils/rangeReader.ts'

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
	return { bytesAt: async (start: number, length: number) => bytes.slice(start, start + length) } as RangeReader
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
		text: (await readCueText(read, file, cue, file.tracks.find((track) => track.number === cue.track)!, await readClusterData(read, cue.cluster))).text,
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

		expect(file!.tracks).toEqual([{ number: 2, name: undefined, language: 'en', format: 'srt', encoding: undefined }])
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
		const notMatroska = { bytesAt: async (_start: number, length: number) => new Uint8Array(length) } as RangeReader

		expect(await readMatroskaFile(notMatroska)).toBeUndefined()
	})
})

describe('a range of the file', () => {
	// What reading the subtitles this way is for: a server that ignores the
	// range would send the whole film
	it('is given up on when the server answers with the whole file', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, body: null })))

		await expect(new Reader('/movie.mkv').bytesAt(0, 16)).rejects.toThrow('No range read: 200')
	})

	// The lengths come from the file itself, which may be damaged
	it('is never larger than the reader allows', async () => {
		const fetch = vi.fn()
		vi.stubGlobal('fetch', fetch)

		await expect(new Reader('/movie.mkv', { maxReadBytes: 1024 }).bytesAt(0, 4096)).rejects.toThrow('more than the 1024 allowed')
		expect(fetch).not.toHaveBeenCalled()
	})
})

// WebVTT reads a `<` as the start of a tag, and drops what follows it
describe('SubRip or ASS text, as WebVTT', () => {
	it('keeps what is no markup, and the italic, bold and underline SubRip has', () => {
		expect(cueMarkup('I <3 you & <i>him</i>, <font color="red">red</font>')).toBe('I &lt;3 you &amp; <i>him</i>, &lt;font color="red">red&lt;/font>')
	})
})

describe('an ASS event', () => {
	it('is its text, without its fields and its styling', () => {
		expect(assText('3,0,Default,,0,0,0,,{\\i1}Bonjour,{\\i0} toi\\Nça va')).toBe('Bonjour, toi\nça va')
	})
})

/**
 * An EBML element, as Matroska writes them: its ID, its size, its data.
 *
 * @param id - The element's ID, with its length marker
 * @param data - Its data, or the elements inside it
 */
function el(id: number, ...data: (Uint8Array | number[])[]): Uint8Array {
	const idBytes: number[] = []
	for (let value = id; value > 0; value = Math.floor(value / 256)) {
		idBytes.unshift(value % 256)
	}
	const content = new Uint8Array(data.reduce((length, part) => length + part.length, 0))
	let offset = 0
	for (const part of data) {
		content.set(part, offset)
		offset += part.length
	}
	// Sizes as 8 bytes, as mkvmerge writes them, so positions are easy to work out
	const size = [0x01, 0, 0, 0, 0, 0, 0, 0]
	for (let value = content.length, i = 7; i > 0; i--, value = Math.floor(value / 256)) {
		size[i] = value % 256
	}
	return new Uint8Array([...idBytes, ...size, ...content])
}

/**
 * An unsigned integer element, big-endian on as few bytes as it takes.
 *
 * @param id - The element's ID
 * @param value - Its value
 */
function uint(id: number, value: number): Uint8Array {
	const bytes: number[] = []
	for (let rest = value; rest > 0 || bytes.length === 0; rest = Math.floor(rest / 256)) {
		bytes.unshift(rest % 256)
	}
	return el(id, bytes)
}
/** A string element */
const str = (id: number, value: string) => el(id, new TextEncoder().encode(value))

/**
 * A Matroska file of one subtitle cue, built byte by byte for what muxers do
 * not all write.
 *
 * @param options - How it is laid out
 * @param options.seekHead - Its seek heads: none, one, or a second the first points to
 * @param options.language - Whether its track says its language
 * @param options.codec - Its subtitle codec
 * @param options.text - The cue's text
 */
function built({ seekHead = 'one', language = true, codec = 'S_TEXT/UTF8', text = 'I <3 you' }: { seekHead?: 'none' | 'one' | 'two', language?: boolean, codec?: string, text?: string } = {}): RangeReader {
	const info = el(0x1549A966, uint(0x2AD7B1, 1000000))
	const tracks = el(0x1654AE6B, el(0xAE, uint(0xD7, 1), uint(0x83, 0x11), str(0x86, codec), ...(language ? [str(0x22B59C, 'ger')] : [])))
	// A block group: the block of track 1 at the cluster's time, lasting 2 s
	const payload = new TextEncoder().encode(text)
	const blockGroup = el(0xA0, el(0xA1, [0x81, 0, 0, 0], payload), uint(0x9B, 2000))
	const timestamp = uint(0xE7, 3000)
	const cluster = el(0x1F43B675, timestamp, blockGroup)
	// The block group comes right after the cluster's timestamp
	const relative = timestamp.length
	const seekEntry = (id: number, position: number) => el(0x4DBB, el(0x53AB, [(id >>> 24) & 0xFF, (id >>> 16) & 0xFF, (id >>> 8) & 0xFF, id & 0xFF]), el(0x53AC, [(position >>> 8) & 0xFF, position & 0xFF]))

	// Laid out as [seek head] info tracks cluster cues [second seek head]
	const seekHeadLength = seekHead === 'none' ? 0 : el(0x114D9B74, seekEntry(0, 0), seekEntry(0, 0), seekEntry(0, 0)).length
	const infoAt = seekHeadLength
	const tracksAt = infoAt + info.length
	const clusterAt = tracksAt + tracks.length
	const cues = el(0x1C53BB6B, el(0xBB, uint(0xB3, 3000), el(0xB7, uint(0xF7, 1), el(0xF1, [(clusterAt >>> 8) & 0xFF, clusterAt & 0xFF]), uint(0xF0, relative))))
	const cuesAt = clusterAt + cluster.length
	const secondAt = cuesAt + cues.length
	const parts = seekHead === 'none'
		? [info, tracks, cluster, cues]
		: seekHead === 'one'
			? [el(0x114D9B74, seekEntry(0x1549A966, infoAt), seekEntry(0x1654AE6B, tracksAt), seekEntry(0x1C53BB6B, cuesAt)), info, tracks, cluster, cues]
			: [el(0x114D9B74, seekEntry(0x1549A966, infoAt), seekEntry(0x1654AE6B, tracksAt), seekEntry(0x114D9B74, secondAt)), info, tracks, cluster, cues, el(0x114D9B74, seekEntry(0x1C53BB6B, cuesAt))]
	const bytes = new Uint8Array([...el(0x1A45DFA3, str(0x4282, 'matroska')), ...el(0x18538067, ...parts)])
	return { bytesAt: async (start: number, length: number) => bytes.slice(start, start + length) } as RangeReader
}

/**
 * The cues of a built file.
 *
 * @param read - The file
 */
async function cuesOfBuilt(read: RangeReader) {
	const file = (await readMatroskaFile(read))!
	const cues = await readCueReferences(read, file)
	return Promise.all(cues.map(async (cue) => ({
		start: cue.start,
		...(await readCueText(read, file, cue, file.tracks[0]!, await readClusterData(read, cue.cluster))),
	})))
}

describe('a Matroska file as not every muxer writes it', () => {
	// Some muxers list the index in a second seek head, near the end
	it('has its index found through a second seek head', async () => {
		expect(await cuesOfBuilt(built({ seekHead: 'two' }))).toEqual([{ start: 3, end: 5, text: 'I &lt;3 you' }])
	})

	// As a browser's MediaRecorder writes WebM
	it('has what its head holds found without a seek head', async () => {
		expect(await cuesOfBuilt(built({ seekHead: 'none' }))).toEqual([{ start: 3, end: 5, text: 'I &lt;3 you' }])
	})

	// The index gives no duration, the block does
	it('ends each cue when its block says', async () => {
		const [cue] = await cuesOfBuilt(built())
		expect(cue!.end).toBe(5)
	})

	it('is in English when its track says no language, as Matroska takes it', async () => {
		const file = await readMatroskaFile(built({ language: false }))
		expect(file!.tracks[0]!.language).toBe('eng')
	})

	it('reads WebM cues written with CRLF line ends', async () => {
		const [cue] = await cuesOfBuilt(built({ codec: 'D_WEBVTT/SUBTITLES', text: '\r\n\r\nPremier\r\nsous-titre' }))
		expect(cue!.text).toBe('Premier\nsous-titre')
	})
})
