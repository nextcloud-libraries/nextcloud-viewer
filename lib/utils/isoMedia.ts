/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Where an mp4, a mov or an m4a keeps its index, and the size of its video,
 * read from a few hundred bytes of it rather than the whole file.
 *
 * These files are a list of boxes, each saying its own length, so the boxes
 * before the index (`moov`) are stepped over by reading their headers alone,
 * however long they are: a camera's index sits after all of its data
 * (`mdat`), and a browser reading the metadata of such a file can end up
 * reading all of it (nextcloud/viewer#2284). The start of the index holds
 * the tracks' headers (`tkhd`), and with them the video's width and height.
 */

import type { IFile } from '@nextcloud/files'

/** The formats laid out in ISO boxes */
export const ISO_MEDIA_MIMES = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'audio/mp4', 'audio/x-m4a', 'audio/m4a']

/** How much is read at once: the boxes at the start, or the start of the index */
const READ_BYTES = 4096

/** How many reads a file gets before it is given up on */
const MAX_READS = 6

/** Box headers: a 32-bit length and a type, the length then possibly 64-bit */
const HEADER_BYTES = 16

export interface IsoMediaProbe {
	/** Whether the index comes before the data */
	indexFirst: boolean
	/** The video's size as it is shown, if it has a video track */
	size?: { width: number, height: number }
}

/** A box: where it starts in the file, its length, and its type */
interface Box {
	offset: number
	length: number
	type: string
	/** Where its content starts, after its header */
	content: number
}

/**
 * Read a file in small ranges, and keep what was read.
 */
class RangeReader {
	private chunks: { offset: number, bytes: Uint8Array }[] = []
	private reads = 0

	constructor(private readonly url: string, private readonly signal?: AbortSignal) {}

	/**
	 * The bytes at an offset, read from the file when not already read.
	 *
	 * Fewer than asked for at the end of the file. A server that answers
	 * the whole file to a range is not read: it would be the whole file.
	 *
	 * @param offset - Where to read from
	 * @param length - How much is needed
	 */
	async bytesAt(offset: number, length: number): Promise<Uint8Array> {
		const chunk = this.chunks.find((read) => offset >= read.offset && offset + length <= read.offset + read.bytes.length)
			?? await this.read(offset, Math.max(length, READ_BYTES))
		return chunk.bytes.subarray(offset - chunk.offset, offset - chunk.offset + length)
	}

	/**
	 * Read a range of the file.
	 *
	 * @param offset - Where to read from
	 * @param length - How much to read
	 */
	private async read(offset: number, length: number): Promise<{ offset: number, bytes: Uint8Array }> {
		if (++this.reads > MAX_READS) {
			throw new Error('Too many reads')
		}
		const controller = new AbortController()
		this.signal?.addEventListener('abort', () => controller.abort(), { once: true })
		try {
			// fetch rather than axios: the read is cut short by hand should a
			// server send more than asked for, and a GET needs no request token
			const response = await fetch(this.url, {
				headers: { Range: `bytes=${offset}-${offset + length - 1}` },
				signal: controller.signal,
			})
			if (response.status === 416) {
				return { offset, bytes: new Uint8Array() }
			}
			if (response.status !== 206 || !response.body) {
				throw new Error(`No range read: ${response.status}`)
			}
			const bytes = new Uint8Array(length)
			let read = 0
			const reader = response.body.getReader()
			while (read < length) {
				const { done, value } = await reader.read()
				if (done) {
					break
				}
				const part = value.subarray(0, length - read)
				bytes.set(part, read)
				read += part.length
			}
			const chunk = { offset, bytes: bytes.subarray(0, read) }
			this.chunks.push(chunk)
			return chunk
		} finally {
			controller.abort()
		}
	}
}

/**
 * The box starting at an offset, or nothing past the end of the file.
 *
 * @param reader - The file
 * @param offset - Where the box starts
 */
async function boxAt(reader: RangeReader, offset: number): Promise<Box | undefined> {
	const header = await reader.bytesAt(offset, HEADER_BYTES)
	if (header.length < 8) {
		return undefined
	}
	const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
	const type = String.fromCharCode(...header.subarray(4, 8))
	let length = view.getUint32(0)
	let content = offset + 8
	if (length === 1) {
		if (header.length < 16) {
			return undefined
		}
		length = Number(view.getBigUint64(8))
		content = offset + 16
	}
	// 0 runs to the end of the file, with nothing after it
	if (length !== 0 && length < content - offset) {
		throw new Error(`Box ${type} is shorter than its header`)
	}
	return { offset, length, type, content }
}

/**
 * Find the first box of a type among the boxes between two offsets.
 *
 * @param reader - The file
 * @param start - Where the first box starts
 * @param end - Where the boxes end, the end of the file if not given
 * @param type - The type to find
 * @param stopAt - Types that end the search when found first
 */
async function findBox(reader: RangeReader, start: number, end: number, type: string, stopAt: string[] = []): Promise<Box | undefined> {
	let offset = start
	while (offset + 8 <= end) {
		const box = await boxAt(reader, offset)
		if (box === undefined || stopAt.includes(box.type)) {
			return undefined
		}
		if (box.type === type) {
			return box
		}
		if (box.length === 0) {
			return undefined
		}
		offset += box.length
	}
	return undefined
}

/**
 * The size a video track is shown at, from its header (`tkhd`): its width
 * and height, swapped when its matrix turns it a quarter, as phones record
 * a video held upright.
 *
 * @param reader - The file
 * @param tkhd - The track header box
 */
async function trackSize(reader: RangeReader, tkhd: Box): Promise<{ width: number, height: number } | undefined> {
	const version = (await reader.bytesAt(tkhd.content, 1))[0]
	// version and flags, then the times, the id and the duration, longer in
	// version 1, then reserved bytes, layer, group, volume and reserved again
	const matrixAt = tkhd.content + 4 + (version === 1 ? 32 : 20) + 16
	const bytes = await reader.bytesAt(matrixAt, 44)
	if (bytes.length < 44) {
		return undefined
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	// 16.16 fixed point
	const width = view.getUint32(36) / 65536
	const height = view.getUint32(40) / 65536
	if (width === 0 || height === 0) {
		return undefined
	}
	// The matrix is a b u, c d v, x y w: a quarter turn leaves a and d at 0
	const quarterTurn = view.getInt32(0) === 0 && view.getInt32(16) === 0
	return quarterTurn ? { width: height, height: width } : { width, height }
}

/**
 * Find where a file keeps its index, and the size of its video.
 *
 * Nothing when it cannot be told in a few small reads: a server answering
 * ranges with the whole file, a box that does not add up, or one too many
 * boxes to step over.
 *
 * @param url - The file
 * @param signal - Cancels the reads
 */
export async function probeIsoMedia(url: string, signal?: AbortSignal): Promise<IsoMediaProbe | undefined> {
	const reader = new RangeReader(url, signal)
	try {
		const ftyp = await boxAt(reader, 0)
		if (ftyp?.type !== 'ftyp') {
			return undefined
		}

		let indexFirst = true
		let offset = ftyp.length
		let moov: Box | undefined
		while (moov === undefined) {
			const box = await boxAt(reader, offset)
			if (box === undefined || box.length === 0) {
				return undefined
			}
			if (box.type === 'mdat') {
				indexFirst = false
			}
			if (box.type === 'moov') {
				moov = box
			}
			offset += box.length
		}

		// The first track with a width and a height, the sound having none
		const end = moov.offset + moov.length
		let trak = await findBox(reader, moov.content, end, 'trak')
		while (trak !== undefined) {
			const tkhd = await findBox(reader, trak.content, trak.offset + trak.length, 'tkhd')
			const size = tkhd && await trackSize(reader, tkhd)
			if (size) {
				return { indexFirst, size }
			}
			trak = await findBox(reader, trak.offset + trak.length, end, 'trak')
		}
		return { indexFirst }
	} catch {
		return undefined
	}
}

/** How many files' probes are kept, the files next to those shown */
const KEPT_PROBES = 50

/** What was found in a file, by its source and version */
const probes = new Map<string, Promise<IsoMediaProbe | undefined>>()

/**
 * Find where a file keeps its index, and the size of its video, once per
 * version of it: the probe of a neighbour serves again when it is shown.
 *
 * @param file - The file
 */
export function probeFile(file: IFile): Promise<IsoMediaProbe | undefined> {
	if (!ISO_MEDIA_MIMES.includes(file.mime ?? '')) {
		return Promise.resolve(undefined)
	}
	const key = `${file.source}#${file.attributes?.etag ?? ''}`
	let probe = probes.get(key)
	if (probe === undefined) {
		probe = probeIsoMedia(file.encodedSource)
		probes.set(key, probe)
		if (probes.size > KEPT_PROBES) {
			probes.delete(probes.keys().next().value!)
		}
	}
	return probe
}
