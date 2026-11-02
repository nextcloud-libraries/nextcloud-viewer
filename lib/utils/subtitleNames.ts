/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Which files are the subtitles of which video, by their names alone.
 *
 * Kept apart from their labels, which need the user's language: the Files
 * action opening a video from its subtitles runs on every page, and this is
 * all it needs.
 */

import type { IFile } from '@nextcloud/files'

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
 * @param tag - The tag a file carries: `pt_BR`, or as Matroska writes it,
 *   `fre` or `ger`, which become `fr` and `de`
 * @return Nothing for what is no language, `und` (undetermined) included
 */
export function canonicalLanguage(tag: string): string | undefined {
	try {
		const language = Intl.getCanonicalLocales(tag.replace('_', '-'))[0]
		return language === 'und' ? undefined : language
	} catch {
		return undefined
	}
}

/**
 * What a file's name says of it as the subtitles of a video: named like it,
 * with a language or not, as players find them. `movie.mp4` goes with
 * `movie.vtt`, `movie.en.vtt` and `movie.pt-BR.srt`.
 *
 * @param video - The video
 * @param file - The file that may be its subtitles
 * @return Nothing for another file, or one named after the video that is not
 *   its subtitles, such as `movie.directors-cut.vtt`
 */
export function subtitleOf(video: IFile, file: IFile): { format: 'vtt' | 'srt', language?: string } | undefined {
	if (file.source === video.source) {
		return undefined
	}
	const extension = video.extension ?? ''
	const name = extension === '' ? video.basename : video.basename.slice(0, -extension.length)
	const match = new RegExp(`^${escapeRegExp(name)}(?:\\.([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*))?\\.(vtt|srt)$`, 'i').exec(file.basename)
	if (match === null) {
		return undefined
	}
	const language = match[1] === undefined ? undefined : canonicalLanguage(match[1])
	if (match[1] !== undefined && language === undefined) {
		return undefined
	}
	return { format: match[2]!.toLowerCase() as 'vtt' | 'srt', language }
}

/**
 * The video a subtitle file is named after, among the files next to it.
 *
 * @param subtitle - The subtitle file
 * @param files - The files next to it
 */
export function findSubtitledVideo(subtitle: IFile, files: IFile[]): IFile | undefined {
	return files.find((file) => file.mime?.startsWith('video/') && subtitleOf(file, subtitle) !== undefined)
}
