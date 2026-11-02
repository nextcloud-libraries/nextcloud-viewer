/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it, vi } from 'vitest'
import { findSubtitles, srtToVtt } from '../lib/utils/subtitles.ts'
import { makeFile } from './factories.ts'

vi.mock('@nextcloud/l10n', async (importOriginal) => ({
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest importOriginal idiom
	...await importOriginal<typeof import('@nextcloud/l10n')>(),
	getLanguage: () => 'en',
}))

const video = makeFile({ basename: 'Holiday 2026.mp4', mime: 'video/mp4' })

/**
 * The subtitles found for the video among files of these names.
 *
 * @param names - The names of the files next to it
 */
function found(names: string[]) {
	return findSubtitles(video, names.map((basename) => makeFile({ basename, mime: 'application/octet-stream' })))
		.map(({ file, format, language, label }) => ({ name: file.basename, format, language, label }))
}

describe('the subtitles of a video', () => {
	it('are the WebVTT and SubRip files named like it', () => {
		expect(found(['Holiday 2026.vtt', 'Holiday 2026.SRT'])).toEqual([
			{ name: 'Holiday 2026.vtt', format: 'vtt', language: undefined, label: 'Subtitles' },
			{ name: 'Holiday 2026.SRT', format: 'srt', language: undefined, label: 'Subtitles' },
		])
	})

	it('are in the language their name says, listed under its name', () => {
		expect(found(['Holiday 2026.fr.vtt', 'Holiday 2026.pt_BR.srt'])).toEqual([
			{ name: 'Holiday 2026.fr.vtt', format: 'vtt', language: 'fr', label: 'French' },
			{ name: 'Holiday 2026.pt_BR.srt', format: 'srt', language: 'pt-BR', label: 'Brazilian Portuguese' },
		])
	})

	it('are not the files of another video, another format, or named after a cut', () => {
		expect(found(['Holiday 2025.vtt', 'Holiday 2026.ass', 'Holiday 2026.directors-cut.vtt', 'Holiday 2026.mp4.txt'])).toEqual([])
	})

	// Shaped like a language tag, but none: no region is two digits
	it('are not the files named after something no language is', () => {
		expect(found(['Holiday 2026.en-12.vtt'])).toEqual([])
	})
})

describe('SubRip, as WebVTT', () => {
	it('has the header, and a dot before the milliseconds', () => {
		const srt = '﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\n'

		expect(srtToVtt(srt)).toBe('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nHello\n')
	})
})
