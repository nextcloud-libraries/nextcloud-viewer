/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Reading the subtitles a Matroska or WebM file carries, without downloading it.
 *
 * Browsers play the video of such a file but none of its subtitle tracks.
 * Those are a few kilobytes of text spread through gigabytes of video, so
 * they are read the way a player seeks: the file's index (its Cues) says
 * where each subtitle is, and only those bytes are fetched, with Range
 * requests. mkvmerge and ffmpeg both index every subtitle by default.
 */

/** A subtitle track of the file */
export interface EmbeddedTrack {
	/** Its number in the file */
	number: number
	/** The name the file gives it, such as "English (SDH)" */
	name?: string
	/** Its language, as the file says it */
	language?: string
	/** How its text is written: as it is, after WebM's cue id and settings lines, or as an ASS event */
	format: 'text' | 'webm' | 'ass'
	/** How each block of it is stored, when not as it is */
	encoding?: ContentEncoding
}

/** A cue of a subtitle track, as the index places it */
export interface CueReference {
	/** The track */
	track: number
	/** When it starts, in seconds */
	start: number
	/** When it ends, in seconds, if the index says */
	end?: number
	/** Where its cluster starts in the file */
	cluster: number
	/** Where its block is in that cluster's data */
	relative: number
}

/** How a track's blocks are stored */
interface ContentEncoding {
	/** 0 is zlib, 3 is header stripping: the only two still written */
	algorithm: number
	/** The bytes header stripping removed from each block */
	settings?: Uint8Array
}

/** What reading a file's head found */
export interface MatroskaFile {
	/** The subtitle tracks the browser can be given */
	tracks: EmbeddedTrack[]
	/** Where the index is, if the file has one */
	cuesPosition?: number
	/** How many nanoseconds a timestamp counts */
	timestampScale: number
	/** Where the segment's data starts, which every position counts from */
	segmentData: number
}

/** The elements read here */
const ID = {
	EBML: 0x1A45DFA3,
	Segment: 0x18538067,
	SeekHead: 0x114D9B74,
	Seek: 0x4DBB,
	SeekID: 0x53AB,
	SeekPosition: 0x53AC,
	Info: 0x1549A966,
	TimestampScale: 0x2AD7B1,
	Tracks: 0x1654AE6B,
	TrackEntry: 0xAE,
	TrackNumber: 0xD7,
	TrackType: 0x83,
	CodecID: 0x86,
	Name: 0x536E,
	Language: 0x22B59C,
	LanguageBCP47: 0x22B59D,
	ContentEncodings: 0x6D80,
	ContentEncoding: 0x6240,
	ContentCompression: 0x5034,
	ContentCompAlgo: 0x4254,
	ContentCompSettings: 0x4255,
	ContentEncryption: 0x5035,
	Cues: 0x1C53BB6B,
	CuePoint: 0xBB,
	CueTime: 0xB3,
	CueTrackPositions: 0xB7,
	CueTrack: 0xF7,
	CueClusterPosition: 0xF1,
	CueRelativePosition: 0xF0,
	CueDuration: 0xB2,
	BlockGroup: 0xA0,
	Block: 0xA1,
	SimpleBlock: 0xA3,
	CRC32: 0xBF,
	Void: 0xEC,
}

/** The track type of subtitles */
const SUBTITLE_TRACK = 0x11

/** The codecs whose text the browser can be given, and how it is written */
const TEXT_CODECS: Record<string, EmbeddedTrack['format']> = {
	'S_TEXT/UTF8': 'text',
	'S_TEXT/WEBVTT': 'text',
	'D_WEBVTT/SUBTITLES': 'webm',
	'D_WEBVTT/CAPTIONS': 'webm',
	'S_TEXT/ASS': 'ass',
	'S_TEXT/SSA': 'ass',
}

/** Enough of the file's start for its header, its seek head and its tracks */
const HEAD_BYTES = 64 * 1024

/** Enough for the block of one subtitle, read again whole if it is longer */
const BLOCK_BYTES = 512

/** An element's ID, the size of its data, and where that data is */
interface Element {
	id: number
	size: number
	/** Where its data starts, in the buffer it was read from */
	data: number
	/** Where it ends, in the buffer it was read from */
	end: number
}

/**
 * Read a variable length integer, as EBML writes its IDs and sizes.
 *
 * @param bytes - The buffer
 * @param position - Where it starts
 * @param keepMarker - Whether the length marker is kept, as in an ID
 */
function readVint(bytes: Uint8Array, position: number, keepMarker = false): { value: number, length: number } {
	const first = bytes[position] ?? 0
	let length = 1
	while (length <= 8 && !(first & (0x80 >> (length - 1)))) {
		length++
	}
	let value = keepMarker ? first : first & (0xFF >> length)
	for (let i = 1; i < length; i++) {
		value = value * 256 + (bytes[position + i] ?? 0)
	}
	return { value, length }
}

/**
 * Read the element starting at a position of a buffer.
 *
 * @param bytes - The buffer
 * @param position - Where it starts
 */
function readElement(bytes: Uint8Array, position: number): Element {
	const id = readVint(bytes, position, true)
	const size = readVint(bytes, position + id.length)
	const data = position + id.length + size.length
	return { id: id.value, size: size.value, data, end: data + size.value }
}

/**
 * The elements inside another, without the CRC-32 and padding ffmpeg and
 * mkvmerge put between them.
 *
 * @param bytes - The buffer
 * @param start - Where the parent's data starts
 * @param end - Where it ends
 */
function childrenOf(bytes: Uint8Array, start: number, end: number): Element[] {
	const children: Element[] = []
	for (let position = start; position < Math.min(end, bytes.length);) {
		const child = readElement(bytes, position)
		if (child.id !== ID.CRC32 && child.id !== ID.Void) {
			children.push(child)
		}
		position = child.end
	}
	return children
}

/**
 * Read an unsigned integer element's value.
 *
 * @param bytes - The buffer
 * @param element - The element
 */
function readUint(bytes: Uint8Array, element: Element): number {
	let value = 0
	for (let i = element.data; i < element.end; i++) {
		value = value * 256 + (bytes[i] ?? 0)
	}
	return value
}

/**
 * Read a string element's value.
 *
 * @param bytes - The buffer
 * @param element - The element
 */
function readString(bytes: Uint8Array, element: Element): string {
	return new TextDecoder().decode(bytes.subarray(element.data, element.end)).replace(/\0+$/, '')
}

/** Fetches a range of the file's bytes */
export type RangeReader = (start: number, length: number) => Promise<Uint8Array>

/**
 * Fetch a range of a file, refusing a server that answers with all of it.
 *
 * A server that ignores the range sends the whole video, which is exactly
 * what reading the subtitles this way avoids: such an answer is cut short
 * and the subtitles are given up on.
 *
 * @param source - The file's address
 * @param signal - Aborts the request
 */
export function rangeReader(source: string, signal?: AbortSignal): RangeReader {
	return async (start, length) => {
		const response = await fetch(source, { headers: { Range: `bytes=${start}-${start + length - 1}` }, signal })
		if (response.status !== 206) {
			await response.body?.cancel()
			throw new Error(`The server does not answer ranges of ${source}`)
		}
		return new Uint8Array(await response.arrayBuffer())
	}
}

/**
 * Read an element at a position of the file, whole, from what was read
 * already when it is in there.
 *
 * @param read - Reads the file
 * @param position - Where the element starts in the file
 * @param head - The start of the file, already read
 */
async function readElementAt(read: RangeReader, position: number, head: Uint8Array): Promise<{ bytes: Uint8Array, element: Element }> {
	if (position + 16 <= head.length) {
		const element = readElement(head, position)
		if (element.end <= head.length) {
			return { bytes: head, element }
		}
	}
	const header = await read(position, 16)
	const { end } = readElement(header, 0)
	const bytes = await read(position, end)
	return { bytes, element: readElement(bytes, 0) }
}

/**
 * The encoding of a track's blocks, if it is one blocks can be undone of.
 *
 * @param bytes - The buffer
 * @param encodings - The track's ContentEncodings
 * @return The encoding, null for one that cannot be read, such as encryption
 */
function readEncoding(bytes: Uint8Array, encodings: Element): ContentEncoding | null {
	const all = childrenOf(bytes, encodings.data, encodings.end).filter((child) => child.id === ID.ContentEncoding)
	if (all.length !== 1) {
		return null
	}
	const fields = childrenOf(bytes, all[0]!.data, all[0]!.end)
	const compression = fields.find((field) => field.id === ID.ContentCompression)
	if (compression === undefined || fields.some((field) => field.id === ID.ContentEncryption)) {
		return null
	}
	const settings = childrenOf(bytes, compression.data, compression.end)
	const algorithm = settings.find((field) => field.id === ID.ContentCompAlgo)
	const stripped = settings.find((field) => field.id === ID.ContentCompSettings)
	const encoding = {
		algorithm: algorithm === undefined ? 0 : readUint(bytes, algorithm),
		settings: stripped === undefined ? undefined : bytes.slice(stripped.data, stripped.end),
	}
	return encoding.algorithm === 0 || encoding.algorithm === 3 ? encoding : null
}

/**
 * Read a file's head: the subtitle tracks the browser can be given, and
 * where its index is.
 *
 * @param read - Reads the file
 * @return Nothing for a file that is not Matroska, or has no such track
 */
export async function readMatroskaFile(read: RangeReader): Promise<MatroskaFile | undefined> {
	const head = await read(0, HEAD_BYTES)
	const ebml = readElement(head, 0)
	if (ebml.id !== ID.EBML) {
		return undefined
	}
	const segment = readElement(head, ebml.end)
	if (segment.id !== ID.Segment) {
		return undefined
	}

	// Where each top level element is, from the seek head at the segment's start
	const positions = new Map<number, number>()
	const seekHead = childrenOf(head, segment.data, segment.data + 4096).find((child) => child.id === ID.SeekHead)
	if (seekHead === undefined) {
		return undefined
	}
	for (const seek of childrenOf(head, seekHead.data, seekHead.end).filter((child) => child.id === ID.Seek)) {
		const fields = childrenOf(head, seek.data, seek.end)
		const id = fields.find((field) => field.id === ID.SeekID)
		const position = fields.find((field) => field.id === ID.SeekPosition)
		if (id !== undefined && position !== undefined) {
			positions.set(readUint(head, id), segment.data + readUint(head, position))
		}
	}
	const tracksPosition = positions.get(ID.Tracks)
	if (tracksPosition === undefined) {
		return undefined
	}

	let timestampScale = 1000000
	const infoPosition = positions.get(ID.Info)
	if (infoPosition !== undefined) {
		const { bytes, element } = await readElementAt(read, infoPosition, head)
		const scale = childrenOf(bytes, element.data, element.end).find((child) => child.id === ID.TimestampScale)
		if (scale !== undefined) {
			timestampScale = readUint(bytes, scale)
		}
	}

	const { bytes, element } = await readElementAt(read, tracksPosition, head)
	const tracks: EmbeddedTrack[] = []
	for (const entry of childrenOf(bytes, element.data, element.end).filter((child) => child.id === ID.TrackEntry)) {
		const fields = childrenOf(bytes, entry.data, entry.end)
		const field = (id: number) => fields.find((child) => child.id === id)
		const type = field(ID.TrackType)
		const codec = field(ID.CodecID)
		const number = field(ID.TrackNumber)
		const format = codec === undefined ? undefined : TEXT_CODECS[readString(bytes, codec)]
		if (type === undefined || readUint(bytes, type) !== SUBTITLE_TRACK || format === undefined || number === undefined) {
			continue
		}
		const encodings = field(ID.ContentEncodings)
		const encoding = encodings === undefined ? undefined : readEncoding(bytes, encodings)
		// Encrypted, or encoded some way no browser undoes
		if (encoding === null) {
			continue
		}
		const name = field(ID.Name)
		const language = field(ID.LanguageBCP47) ?? field(ID.Language)
		tracks.push({
			number: readUint(bytes, number),
			name: name === undefined ? undefined : readString(bytes, name),
			language: language === undefined ? undefined : readString(bytes, language),
			format,
			encoding,
		})
	}
	if (tracks.length === 0) {
		return undefined
	}
	return { tracks, cuesPosition: positions.get(ID.Cues), timestampScale, segmentData: segment.data }
}

/**
 * Read the index: where every cue of the file's subtitle tracks is.
 *
 * @param read - Reads the file
 * @param file - What its head said
 * @return Its cues, in the order they come, or none for a file whose index
 *   does not place them, as a recording cut short has no index at all
 */
export async function readCueReferences(read: RangeReader, file: MatroskaFile): Promise<CueReference[]> {
	if (file.cuesPosition === undefined) {
		return []
	}
	const { bytes, element } = await readElementAt(read, file.cuesPosition, new Uint8Array())
	if (element.id !== ID.Cues) {
		return []
	}
	const subtitleTracks = new Set(file.tracks.map((track) => track.number))
	const seconds = (timestamp: number) => timestamp * file.timestampScale / 1e9
	const cues: CueReference[] = []
	for (const point of childrenOf(bytes, element.data, element.end).filter((child) => child.id === ID.CuePoint)) {
		const fields = childrenOf(bytes, point.data, point.end)
		const time = fields.find((field) => field.id === ID.CueTime)
		if (time === undefined) {
			continue
		}
		for (const positions of fields.filter((field) => field.id === ID.CueTrackPositions)) {
			const values = new Map(childrenOf(bytes, positions.data, positions.end).map((child) => [child.id, readUint(bytes, child)]))
			const track = values.get(ID.CueTrack)
			const cluster = values.get(ID.CueClusterPosition)
			const relative = values.get(ID.CueRelativePosition)
			// Without its place in the cluster, the block would have to be
			// looked for through the whole cluster
			if (track === undefined || !subtitleTracks.has(track) || cluster === undefined || relative === undefined) {
				continue
			}
			const start = readUint(bytes, time)
			const duration = values.get(ID.CueDuration)
			cues.push({
				track,
				start: seconds(start),
				end: duration === undefined ? undefined : seconds(start + duration),
				// Counted from the segment's data, as the seek head is
				cluster: file.segmentData + cluster,
				relative,
			})
		}
	}
	return cues.sort((a, b) => a.start - b.start)
}

/**
 * Undo how a track stores its blocks.
 *
 * @param data - A block's frame
 * @param encoding - The track's encoding
 */
async function decode(data: Uint8Array, encoding?: ContentEncoding): Promise<Uint8Array> {
	if (encoding === undefined) {
		return data
	}
	if (encoding.algorithm === 3) {
		const settings = encoding.settings ?? new Uint8Array()
		const whole = new Uint8Array(settings.length + data.length)
		whole.set(settings)
		whole.set(data, settings.length)
		return whole
	}
	const stream = new Response(data.slice()).body!.pipeThrough(new DecompressionStream('deflate'))
	return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * The text of an ASS or SSA event, without its fields and its styling.
 *
 * Matroska keeps an event as `ReadOrder, Layer, Style, Name, MarginL,
 * MarginR, MarginV, Effect, Text`: what is shown is the last field, whose
 * override tags (`{\i1}`) the browser has no way to show.
 *
 * @param event - The event
 */
export function assText(event: string): string {
	const text = event.split(',').slice(8).join(',')
	return text.replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' ')
}

/**
 * Read the text of a cue from its block.
 *
 * @param read - Reads the file
 * @param cue - Where it is
 * @param track - Its track
 * @param clusterData - Where its cluster's data starts, read once per cluster
 */
export async function readCueText(read: RangeReader, cue: CueReference, track: EmbeddedTrack, clusterData: number): Promise<string> {
	const position = clusterData + cue.relative
	let bytes = await read(position, BLOCK_BYTES)
	let block = readElement(bytes, 0)
	if (block.end > bytes.length) {
		bytes = await read(position, block.end)
		block = readElement(bytes, 0)
	}
	if (block.id === ID.BlockGroup) {
		const inner = childrenOf(bytes, block.data, block.end).find((child) => child.id === ID.Block)
		if (inner === undefined) {
			throw new Error('A block group without its block')
		}
		block = inner
	}
	if (block.id !== ID.Block && block.id !== ID.SimpleBlock) {
		throw new Error(`No block where the index places one: ${block.id.toString(16)}`)
	}
	// The track number, then a 16-bit timestamp and the flags. Subtitles
	// are not laced: what follows is the one frame
	const trackNumber = readVint(bytes, block.data)
	const frame = await decode(bytes.subarray(block.data + trackNumber.length + 3, block.end), track.encoding)
	const text = new TextDecoder().decode(frame)
	if (track.format === 'ass') {
		return assText(text)
	}
	// WebM puts the cue's id and its settings on the lines before its text
	return track.format === 'webm' ? text.split('\n').slice(2).join('\n') : text
}

/**
 * Where a cluster's data starts: after its ID and its size, which the
 * relative positions of its blocks count from.
 *
 * @param read - Reads the file
 * @param cluster - Where the cluster starts
 */
export async function readClusterData(read: RangeReader, cluster: number): Promise<number> {
	return cluster + readElement(await read(cluster, 16), 0).data
}
