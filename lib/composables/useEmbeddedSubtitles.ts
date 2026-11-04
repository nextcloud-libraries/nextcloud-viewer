/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile } from '@nextcloud/files'
import type { Ref } from 'vue'
import type { CueReference, EmbeddedTrack, MatroskaFile } from '../utils/matroska.ts'
import type { RangeReader } from '../utils/rangeReader.ts'

import { onBeforeUnmount, watch } from 'vue'
import { logger } from '../services/logger.ts'
import { canDownload } from '../utils/canDownload.ts'
import { matroskaReader, readClusterAhead, readClusterData, readCueReferences, readCueText, readMatroskaFile } from '../utils/matroska.ts'
import { canonicalLanguage, languageLabel } from '../utils/subtitles.ts'

/** The containers that carry subtitles a browser plays the video of */
const MATROSKA_MIMES = ['video/x-matroska', 'video/webm']

/**
 * How far ahead of playback the cues are fetched, in seconds: enough that
 * they are there when shown, little enough that a film is not read whole
 */
const LOOKAHEAD = 60

/** How long a cue whose end neither the index nor its block gives is shown for */
const FALLBACK_DURATION = 5

/** How long a failed read of the index waits before it is tried again, in milliseconds */
const RETRY_AFTER = 10000

/**
 * The subtitles a Matroska or WebM video carries, as text tracks of its
 * player. Browsers play these videos but show none of their subtitles.
 *
 * The tracks are listed as soon as the file's head is read, which is one
 * request. Their cues are only fetched once the user turns one on, and only
 * those just ahead of playback, as it goes: a film is hours of video for a
 * few kilobytes of text, which the file's index places one by one.
 *
 * @param video - The video element
 * @param file - The video
 */
export function useEmbeddedSubtitles(video: Ref<HTMLVideoElement | null>, file: Ref<IFile>) {
	// Aborts what is read for the video shown, and lets go of its listeners
	let controller: AbortController | undefined

	// Read again for another file, not for a new name of the same one: a
	// renamed video keeps its element, and the text tracks a browser has no
	// way to remove would be listed twice. Its reads follow the new name
	watch([video, () => file.value.fileid ?? file.value.source], ([element]) => {
		controller?.abort()
		controller = undefined
		// A share that forbids downloading answers no request of ours, and
		// an end-to-end encrypted file's bytes say nothing before decryption
		if (element === null || !MATROSKA_MIMES.includes(file.value.mime ?? '')
			|| !canDownload(file.value) || file.value.attributes?.['e2ee-is-encrypted']) {
			return
		}
		const current = new AbortController()
		controller = current
		const read = matroskaReader(() => file.value.encodedSource, current.signal)
		showEmbeddedSubtitles(element, read, current.signal)
			.catch((error) => {
				// An abort is the video changing, not a failure; any other one
				// leaves the video as it plays without them
				if (!current.signal.aborted) {
					logger.debug(`Could not read the subtitles inside ${file.value.basename}`, { error })
				}
			})
	}, { immediate: true })

	onBeforeUnmount(() => controller?.abort())
}

/**
 * List the file's subtitle tracks on the video, and fill each with its
 * cues while it is shown.
 *
 * The video element is mounted again for each file, so a text track added
 * here, which a browser has no way to remove, is never left on another.
 *
 * @param element - The video element
 * @param read - Reads the file
 * @param signal - Aborted when the video is no longer shown
 */
async function showEmbeddedSubtitles(element: HTMLVideoElement, read: RangeReader, signal: AbortSignal): Promise<void> {
	const matroska = await readMatroskaFile(read)
	if (matroska === undefined || signal.aborted) {
		return
	}

	const textTracks = new Map<number, { embedded: EmbeddedTrack, track: TextTrack }>()
	for (const embedded of matroska.tracks) {
		const language = embedded.language === undefined ? undefined : canonicalLanguage(embedded.language)
		const track = element.addTextTrack('subtitles', embedded.name || languageLabel(language), language)
		// Added hidden, which is shown to no one but would have its cues read
		track.mode = 'disabled'
		textTracks.set(embedded.number, { embedded, track })
	}

	const load = cueLoader(read, matroska, textTracks, signal)
	// Listeners nothing awaits: what fails is logged here, not left uncaught
	const update = () => load(element.currentTime).catch((error) => {
		if (!signal.aborted) {
			logger.debug('Could not read the subtitles of the video', { error })
		}
	})
	element.addEventListener('timeupdate', update, { signal })
	element.addEventListener('seeked', update, { signal })
	// A track turned on in the captions menu
	element.textTracks.addEventListener('change', update, { signal })
}

/**
 * The first of cues sorted by their start that starts at a time or after.
 *
 * @param cues - The cues, sorted by their start
 * @param time - The time, in seconds
 */
function firstFrom(cues: CueReference[], time: number): number {
	let low = 0
	let high = cues.length
	while (low < high) {
		const middle = (low + high) >> 1
		if (cues[middle]!.start < time) {
			low = middle + 1
		} else {
			high = middle
		}
	}
	return low
}

/**
 * Fetch the cues of the tracks shown, from a time to a minute ahead of it,
 * each only once, and those of one cluster together.
 *
 * @param read - Reads the file
 * @param matroska - What its head said
 * @param textTracks - The text track of each subtitle track, by its number
 * @param signal - Aborted when the video is no longer shown
 */
function cueLoader(read: RangeReader, matroska: MatroskaFile, textTracks: Map<number, { embedded: EmbeddedTrack, track: TextTrack }>, signal: AbortSignal) {
	// The index, read the first time a track is shown
	let index: Promise<{ cues: CueReference[], longest: number }> | undefined
	// When a failed read of the index may be tried again
	let retryAt = 0
	// The cues asked for already, shown or on their way
	const requested = new Set<CueReference>()
	// Where each cluster's data starts, read once for all the cues in it
	const clusters = new Map<number, Promise<number>>()

	/**
	 * The index, read once, and again a while after it failed.
	 */
	function readIndex() {
		index ??= readCueReferences(read, matroska).then((cues) => ({
			cues,
			// How long the longest cue is: one that began this long ago may still be up
			longest: Math.max(0, ...cues.map((cue) => (cue.end ?? cue.start + FALLBACK_DURATION) - cue.start)),
		}), (error) => {
			index = undefined
			retryAt = Date.now() + RETRY_AFTER
			throw error
		})
		return index
	}

	/**
	 * Read the text of one cue and show it.
	 *
	 * @param cue - The cue
	 */
	async function show(cue: CueReference) {
		const { embedded, track } = textTracks.get(cue.track)!
		if (!clusters.has(cue.cluster)) {
			clusters.set(cue.cluster, readClusterData(read, cue.cluster))
		}
		const { text, end } = await readCueText(read, matroska, cue, embedded, await clusters.get(cue.cluster)!)
		if (!signal.aborted) {
			track.addCue(new VTTCue(cue.start, cue.end ?? end ?? cue.start + FALLBACK_DURATION, text))
		}
	}

	return async (time: number) => {
		const shown = [...textTracks.values()].filter(({ track }) => track.mode === 'showing')
		if (shown.length === 0 || signal.aborted || Date.now() < retryAt) {
			return
		}
		const { cues, longest } = await readIndex()
		const shownNumbers = new Set(shown.map(({ embedded }) => embedded.number))
		const due: CueReference[] = []
		// Sorted by their start: only those that may still be up, to a minute ahead
		for (let i = firstFrom(cues, time - longest); i < cues.length && cues[i]!.start <= time + LOOKAHEAD; i++) {
			const cue = cues[i]!
			if (!requested.has(cue) && shownNumbers.has(cue.track) && (cue.end ?? cue.start + longest) >= time) {
				due.push(cue)
			}
		}
		due.forEach((cue) => requested.add(cue))

		const byCluster = new Map<number, CueReference[]>()
		for (const cue of due) {
			byCluster.set(cue.cluster, [...byCluster.get(cue.cluster) ?? [], cue])
		}
		await Promise.all([...byCluster].map(async ([cluster, ofCluster]) => {
			try {
				await readClusterAhead(read, cluster, ofCluster)
			} catch {
				// Each is read on its own then
			}
			for (const cue of ofCluster) {
				try {
					await show(cue)
				} catch (error) {
					// Not asked for again: playback asks a few times a second,
					// and a cue the server failed once is unlikely to come the next
					if (!signal.aborted) {
						logger.debug('Could not read a subtitle cue', { error, cue })
					}
				}
			}
		}))
	}
}
