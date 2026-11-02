/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile } from '@nextcloud/files'

import { getLanguage } from '@nextcloud/l10n'
import { t } from './l10n.ts'

/** A subtitle file found next to a video */
export interface Subtitle {
	/** The subtitle file */
	file: IFile
	/** Its format: WebVTT plays as it is, SubRip is turned into it first */
	format: 'vtt' | 'srt'
	/** The language it is in, when its name says so */
	language?: string
	/** What the player's captions menu lists it as */
	label: string
}

/**
 * Escape a string to be matched as is in a regular expression.
 *
 * @param text - The text to escape
 */
function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A language tag the browser understands, in its canonical form.
 *
 * @param tag - The tag a file name carries
 */
function canonicalLanguage(tag: string): string | undefined {
	try {
		return Intl.getCanonicalLocales(tag.replace('_', '-'))[0]
	} catch {
		return undefined
	}
}

/**
 * The subtitles of a video in a list of files: named like it, with a
 * language or not, as players find them. `movie.mp4` goes with
 * `movie.vtt`, `movie.en.vtt` and `movie.pt-BR.srt`.
 *
 * Only WebVTT and SubRip: browsers read WebVTT alone, and SubRip is close
 * enough to be turned into it. Styled formats (ASS, SSA) are not.
 *
 * @param video - The video
 * @param files - The files next to it
 */
export function findSubtitles(video: IFile, files: IFile[]): Subtitle[] {
	const extension = video.extension ?? ''
	const name = extension === '' ? video.basename : video.basename.slice(0, -extension.length)
	const pattern = new RegExp(`^${escapeRegExp(name)}(?:\\.([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*))?\\.(vtt|srt)$`, 'i')
	const displayNames = new Intl.DisplayNames([getLanguage().replace('_', '-')], { type: 'language' })

	const subtitles: Subtitle[] = []
	for (const file of files) {
		const match = pattern.exec(file.basename)
		if (match === null || file.source === video.source) {
			continue
		}
		const language = match[1] === undefined ? undefined : canonicalLanguage(match[1])
		// Not a language: another file named after the video, such as a cut
		if (match[1] !== undefined && language === undefined) {
			continue
		}
		subtitles.push({
			file,
			format: match[2]!.toLowerCase() as Subtitle['format'],
			language,
			label: language === undefined ? t('Subtitles') : (displayNames.of(language) ?? language),
		})
	}
	return subtitles
}

/**
 * Turn SubRip into WebVTT, which is all the browser reads.
 *
 * The two differ in their header and in the comma SubRip puts before the
 * milliseconds; the numbers before each cue are cue names to WebVTT.
 *
 * @param srt - The SubRip text
 */
export function srtToVtt(srt: string): string {
	const body = srt
		.replace(/^\uFEFF/, '')
		.replace(/\r\n?/g, '\n')
		.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
	return `WEBVTT\n\n${body}`
}
