/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile } from '@nextcloud/files'
import type { Ref } from 'vue'

import axios from '@nextcloud/axios'
import { onBeforeUnmount, ref, watch } from 'vue'
import { logger } from '../services/logger.ts'
import { canDownload } from '../utils/canDownload.ts'
import { findSubtitles, srtToVtt } from '../utils/subtitles.ts'

/** A `<track>` of the video */
export interface SubtitleTrack {
	/** The WebVTT to read, as an object URL */
	src: string
	srclang?: string
	label: string
}

/**
 * The subtitles found next to a video, as tracks of its player.
 *
 * Each is fetched and handed over as WebVTT from an object URL: the server
 * knows no type for subtitle files, and a browser reads a track only as
 * `text/vtt`. One in a share that forbids downloading is left out.
 *
 * @param file - The video
 * @param files - The files next to it
 */
export function useSubtitles(file: Ref<IFile>, files: Ref<IFile[]>) {
	const tracks = ref<SubtitleTrack[]>([])
	let controller: AbortController | undefined

	/** Let go of the tracks shown, and of what is still loading */
	function release() {
		controller?.abort()
		for (const track of tracks.value) {
			URL.revokeObjectURL(track.src)
		}
		tracks.value = []
	}

	watch([() => file.value.source, () => files.value.map((other) => other.source).join('\n')], async () => {
		release()
		const subtitles = findSubtitles(file.value, files.value).filter((subtitle) => canDownload(subtitle.file))
		if (subtitles.length === 0) {
			return
		}
		const current = new AbortController()
		controller = current
		const loaded = await Promise.all(subtitles.map(async (subtitle): Promise<SubtitleTrack | undefined> => {
			try {
				const { data } = await axios.get<string>(subtitle.file.encodedSource, { responseType: 'text', signal: current.signal })
				const vtt = subtitle.format === 'srt' ? srtToVtt(data) : data
				return {
					src: URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })),
					srclang: subtitle.language,
					label: subtitle.label,
				}
			} catch (error) {
				if (!current.signal.aborted) {
					logger.warn(`Could not load the subtitles ${subtitle.file.basename}`, { error })
				}
				return undefined
			}
		}))
		const found = loaded.filter((track) => track !== undefined)
		if (current.signal.aborted) {
			found.forEach((track) => URL.revokeObjectURL(track.src))
			return
		}
		tracks.value = found
	}, { immediate: true })

	onBeforeUnmount(release)

	return { tracks }
}
