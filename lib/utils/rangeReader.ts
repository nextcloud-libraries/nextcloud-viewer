/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** What a reader may cost, and what cuts it short */
export interface RangeReaderOptions {
	/** How much is read at once at the least, so the next bytes asked for are there already */
	readBytes?: number
	/**
	 * The most one read may ask for. The lengths asked for come from the file
	 * itself, and a damaged one would otherwise have the whole video read
	 */
	maxReadBytes?: number
	/** How many reads the file gets before it is given up on */
	maxReads?: number
	/** Aborts the read under way, and every one after */
	signal?: AbortSignal
}

/**
 * Read a file in small ranges, and keep what was read.
 *
 * A server that answers the whole file to a range is not read: it would be
 * the whole file, which reading it this way is there to avoid.
 */
export class RangeReader {
	private chunks: { offset: number, bytes: Uint8Array }[] = []
	private reads = 0
	private readonly readBytes: number
	private readonly maxReadBytes: number
	private readonly maxReads: number
	private readonly signal?: AbortSignal

	/**
	 * @param url - The file, or what gives its address now: a file renamed while
	 *   it is read is read on at its new one
	 * @param options - What a read may cost
	 */
	constructor(private readonly url: string | (() => string), options: RangeReaderOptions = {}) {
		this.readBytes = options.readBytes ?? 4096
		this.maxReadBytes = options.maxReadBytes ?? 1024 * 1024
		this.maxReads = options.maxReads ?? 6
		this.signal = options.signal
	}

	/**
	 * The bytes at an offset, read from the file when not already read.
	 *
	 * Fewer than asked for at the end of the file.
	 *
	 * @param offset - Where to read from
	 * @param length - How much is needed
	 */
	async bytesAt(offset: number, length: number): Promise<Uint8Array> {
		const chunk = this.chunks.find((read) => offset >= read.offset && offset + length <= read.offset + read.bytes.length)
			?? await this.read(offset, Math.max(length, this.readBytes))
		return chunk.bytes.subarray(offset - chunk.offset, offset - chunk.offset + length)
	}

	/**
	 * Read a range of the file.
	 *
	 * @param offset - Where to read from
	 * @param length - How much to read
	 */
	private async read(offset: number, length: number): Promise<{ offset: number, bytes: Uint8Array }> {
		if (length > this.maxReadBytes) {
			throw new Error(`A read of ${length} bytes, more than the ${this.maxReadBytes} allowed`)
		}
		if (++this.reads > this.maxReads) {
			throw new Error('Too many reads')
		}
		this.signal?.throwIfAborted()
		const controller = new AbortController()
		const abort = () => controller.abort()
		this.signal?.addEventListener('abort', abort)
		try {
			// fetch rather than axios: the read is cut short by hand should a
			// server send more than asked for, and a GET needs no request token
			const response = await fetch(typeof this.url === 'string' ? this.url : this.url(), {
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
			this.signal?.removeEventListener('abort', abort)
			controller.abort()
		}
	}
}
