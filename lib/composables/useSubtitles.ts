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
	// The tracks handed to the player, each holding an object URL of ours
	const tracks = ref<SubtitleTrack[]>([])
	// The requests for the video shown: another video, or the player going
	// away, aborts them, so a late answer is never shown on the wrong one
	let controller: AbortController | undefined

	/**
	 * Let go of the tracks shown, and of what is still loading.
	 *
	 * An object URL holds its blob until revoked, so every track made here
	 * is revoked once it is no longer the video's.
	 */
	function release() {
		controller?.abort()
		for (const track of tracks.value) {
			URL.revokeObjectURL(track.src)
		}
		tracks.value = []
	}

	// Looked for again when the video changes, or the files next to it do,
	// as a folder that loads more brings its subtitles in later. The sources
	// are compared as one string: a new array of the same files is no change
	watch([() => file.value.source, () => files.value.map((other) => other.source).join('\n')], async () => {
		release()
		// A share that forbids downloading serves the file to no request of
		// ours either, and its subtitles are its content as much as the video
		const subtitles = findSubtitles(file.value, files.value).filter((subtitle) => canDownload(subtitle.file))
		if (subtitles.length === 0) {
			return
		}
		const current = new AbortController()
		controller = current
		// All at once: one that fails leaves the others, and is only logged,
		// as the video plays the same without it
		const loaded = await Promise.all(subtitles.map(async (subtitle): Promise<SubtitleTrack | undefined> => {
			try {
				// Fetched rather than given to the track by its address: the
				// server knows no type for subtitle files and sends them as
				// `application/octet-stream`, which a browser refuses as a track
				const { data } = await axios.get<string>(subtitle.file.encodedSource, { responseType: 'text', signal: current.signal })
				const vtt = subtitle.format === 'srt' ? srtToVtt(data) : data
				return {
					src: URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })),
					srclang: subtitle.language,
					label: subtitle.label,
				}
			} catch (error) {
				// An aborted request is the video changing, not a failure
				if (!current.signal.aborted) {
					logger.warn(`Could not load the subtitles ${subtitle.file.basename}`, { error })
				}
				return undefined
			}
		}))
		const found = loaded.filter((track) => track !== undefined)
		// Another video came while these loaded: they are not its tracks,
		// and nothing else will revoke them
		if (current.signal.aborted) {
			found.forEach((track) => URL.revokeObjectURL(track.src))
			return
		}
		tracks.value = found
	}, { immediate: true })

	onBeforeUnmount(release)

	return { tracks }
}
