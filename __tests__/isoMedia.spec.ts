/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeFile, probeIsoMedia } from '../lib/utils/isoMedia.ts'
import { makeFile } from './factories.ts'

/**
 * A box: its header, then its content.
 *
 * @param type - Its four letters
 * @param content - What it holds
 */
function box(type: string, ...content: Uint8Array[]): Uint8Array {
	const length = 8 + content.reduce((total, part) => total + part.length, 0)
	const bytes = new Uint8Array(length)
	new DataView(bytes.buffer).setUint32(0, length)
	bytes.set([...type].map((c) => c.charCodeAt(0)), 4)
	let offset = 8
	for (const part of content) {
		bytes.set(part, offset)
		offset += part.length
	}
	return bytes
}

/**
 * Only the header of a box, for one too long to build: its 64-bit length.
 *
 * @param type - Its four letters
 * @param length - Its whole length
 */
function largeBoxHeader(type: string, length: number): Uint8Array {
	const bytes = new Uint8Array(16)
	const view = new DataView(bytes.buffer)
	view.setUint32(0, 1)
	bytes.set([...type].map((c) => c.charCodeAt(0)), 4)
	view.setBigUint64(8, BigInt(length))
	return bytes
}

/**
 * A track header, version 0.
 *
 * @param width - The video's width, 0 for a sound
 * @param height - The video's height, 0 for a sound
 * @param quarterTurn - Whether its matrix turns it upright, as phones do
 */
function tkhd(width: number, height: number, quarterTurn = false): Uint8Array {
	const content = new Uint8Array(4 + 20 + 16 + 36 + 8)
	const view = new DataView(content.buffer)
	const matrix = 4 + 20 + 16
	const one = 0x00010000
	if (quarterTurn) {
		view.setInt32(matrix + 4, one)
		view.setInt32(matrix + 12, -one)
	} else {
		view.setInt32(matrix, one)
		view.setInt32(matrix + 16, one)
	}
	view.setInt32(matrix + 32, 0x40000000)
	view.setUint32(matrix + 36, width * 65536)
	view.setUint32(matrix + 40, height * 65536)
	return box('tkhd', content)
}

/**
 * An index with a header and the given tracks.
 *
 * @param tracks - The tracks' headers
 */
function moov(...tracks: Uint8Array[]): Uint8Array {
	return box('moov', box('mvhd', new Uint8Array(100)), ...tracks.map((header) => box('trak', header)))
}

const ftyp = box('ftyp', new Uint8Array(16))

/**
 * Serve a file made of parts at offsets, zeros in between, as a server
 * answering ranges would, or as one sending the whole file whatever is
 * asked for.
 *
 * @param length - The file's length
 * @param parts - What is at which offset
 * @param ranges - Whether the server answers ranges
 */
function serve(length: number, parts: [number, Uint8Array][], ranges = true) {
	const served = { reads: [] as string[], bytes: 0 }
	const slice = (start: number, end: number) => {
		const bytes = new Uint8Array(end - start)
		for (const [offset, part] of parts) {
			const from = Math.max(start, offset)
			const to = Math.min(end, offset + part.length)
			if (from < to) {
				bytes.set(part.subarray(from - offset, to - offset), from - start)
			}
		}
		return bytes
	}
	vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
		const range = (init.headers as Record<string, string>).Range!
		served.reads.push(range)
		const [, from, to] = range.match(/bytes=(\d+)-(\d+)/)!.map(Number)
		if (ranges && from! >= length) {
			return new Response(null, { status: 416 })
		}
		const [start, end] = ranges ? [from!, Math.min(to! + 1, length)] : [0, length]
		let offset = start
		return new Response(new ReadableStream({
			pull(controller) {
				if (offset >= end) {
					controller.close()
					return
				}
				const chunk = slice(offset, Math.min(offset + 16 * 1024, end))
				offset += chunk.length
				served.bytes += chunk.length
				controller.enqueue(chunk)
			},
		}), { status: ranges ? 206 : 200 })
	}))
	return served
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('probeIsoMedia', () => {
	it('reads the size of a video with its index first, in one read', async () => {
		const index = moov(tkhd(1920, 1080))
		const served = serve(ftyp.length + index.length + 5000, [[0, ftyp], [ftyp.length, index]])

		expect(await probeIsoMedia('/clip.mp4')).toEqual({ indexFirst: true, size: { width: 1920, height: 1080 } })
		expect(served.reads).toHaveLength(1)
	})

	// What cameras write: the index after all of the data, here 4 GiB of it
	it('steps over the data to an index at the end, reading two small ranges', async () => {
		const data = 4 * 1024 ** 3
		const index = moov(tkhd(3840, 2160))
		const indexAt = ftyp.length + data
		const served = serve(indexAt + index.length, [[0, ftyp], [ftyp.length, largeBoxHeader('mdat', data)], [indexAt, index]])

		expect(await probeIsoMedia('/film.mp4')).toEqual({ indexFirst: false, size: { width: 3840, height: 2160 } })
		expect(served.reads).toEqual(['bytes=0-4095', `bytes=${indexAt}-${indexAt + 4095}`])
		expect(served.bytes).toBeLessThanOrEqual(2 * 4096)
	})

	it('steps over a large box before the index', async () => {
		const extra = box('uuid', new Uint8Array(200_000))
		const index = moov(tkhd(1280, 720))
		serve(ftyp.length + extra.length + index.length, [[0, ftyp], [ftyp.length, extra], [ftyp.length + extra.length, index]])

		expect(await probeIsoMedia('/camera.mp4')).toEqual({ indexFirst: true, size: { width: 1280, height: 720 } })
	})

	it('turns the size of a video recorded with the phone upright', async () => {
		const index = moov(tkhd(1920, 1080, true))
		serve(ftyp.length + index.length, [[0, ftyp], [ftyp.length, index]])

		expect((await probeIsoMedia('/phone.mov'))?.size).toEqual({ width: 1080, height: 1920 })
	})

	it('finds the video track after the sound', async () => {
		const index = moov(tkhd(0, 0), tkhd(640, 480))
		serve(ftyp.length + index.length, [[0, ftyp], [ftyp.length, index]])

		expect((await probeIsoMedia('/clip.mp4'))?.size).toEqual({ width: 640, height: 480 })
	})

	it('has no size for a sound', async () => {
		const index = moov(tkhd(0, 0))
		serve(ftyp.length + index.length, [[0, ftyp], [ftyp.length, index]])

		expect(await probeIsoMedia('/song.m4a')).toEqual({ indexFirst: true })
	})

	// It would be the whole file: the read stops at what was asked for
	it('gives up on a server that answers the whole file to a range', async () => {
		const index = moov(tkhd(1920, 1080))
		const served = serve(2 * 1024 * 1024, [[0, ftyp], [ftyp.length, box('mdat', new Uint8Array(100))], [ftyp.length + 108, index]], false)

		expect(await probeIsoMedia('/film.mp4')).toBeUndefined()
		expect(served.bytes).toBeLessThanOrEqual(4096 + 16 * 1024)
	})

	it.each([
		['is not an iso media file', [[0, box('RIFF', new Uint8Array(100))]]],
		['ends before its index', [[0, ftyp], [ftyp.length, box('mdat', new Uint8Array(100))]]],
		['has data running to its end', [[0, ftyp], [ftyp.length, new Uint8Array([0, 0, 0, 0, ...'mdat'].map((c) => typeof c === 'string' ? c.charCodeAt(0) : c))]]],
	] as [string, [number, Uint8Array][]][])('gives up on a file that %s', async (_name, parts) => {
		serve(10_000, parts)

		expect(await probeIsoMedia('/odd.mp4')).toBeUndefined()
	})

	it('gives up after a few reads', async () => {
		// Boxes each just over a read long, so every header is a read of its own
		const parts: [number, Uint8Array][] = [[0, ftyp]]
		let offset = ftyp.length
		for (let i = 0; i < 10; i++) {
			const filler = box('free', new Uint8Array(5000))
			parts.push([offset, filler])
			offset += filler.length
		}
		const index = moov(tkhd(640, 480))
		parts.push([offset, index])
		const served = serve(offset + index.length, parts)

		expect(await probeIsoMedia('/padded.mp4')).toBeUndefined()
		expect(served.reads.length).toBeLessThanOrEqual(6)
	})
})

describe('probeFile', () => {
	it('probes a version of a file once', async () => {
		const index = moov(tkhd(640, 480))
		const served = serve(ftyp.length + index.length, [[0, ftyp], [ftyp.length, index]])
		const file = makeFile({ basename: 'once.mp4', mime: 'video/mp4', attributes: { etag: 'a' } })

		await probeFile(file)
		await probeFile(file)
		expect(served.reads).toHaveLength(1)

		await probeFile(makeFile({ id: file.fileid, basename: 'once.mp4', mime: 'video/mp4', attributes: { etag: 'b' } }))
		expect(served.reads).toHaveLength(2)
	})

	it('reads nothing of a format that is not laid out in boxes', async () => {
		const served = serve(100, [])

		expect(await probeFile(makeFile({ basename: 'clip.webm', mime: 'video/webm' }))).toBeUndefined()
		expect(served.reads).toEqual([])
	})
})
