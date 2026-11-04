/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile } from '@nextcloud/files'

import { getLanguage } from '@nextcloud/l10n'
import { t } from './l10n.ts'
import { subtitleOf } from './subtitleNames.ts'

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
 * What the player's captions menu lists a track in this language as.
 *
 * @param language - Its language, if known
 */
export function languageLabel(language?: string): string {
	if (language === undefined) {
		return t('Subtitles')
	}
	const displayNames = new Intl.DisplayNames([getLanguage().replace('_', '-')], { type: 'language' })
	return displayNames.of(language) ?? language
}

/**
 * The subtitles of a video in a list of files, as `subtitleOf()` names them,
 * with what the player's captions menu lists each as.
 *
 * Only WebVTT and SubRip: browsers read WebVTT alone, and SubRip is close
 * enough to be turned into it. Styled formats (ASS, SSA) are not.
 *
 * @param video - The video
 * @param files - The files next to it
 */
export function findSubtitles(video: IFile, files: IFile[]): Subtitle[] {
	return files.flatMap((file) => {
		const name = subtitleOf(video, file)
		return name === undefined ? [] : [{ file, ...name, label: languageLabel(name.language) }]
	})
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
