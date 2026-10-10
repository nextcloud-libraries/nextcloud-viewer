/*!
 * SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { EmitFn } from 'vue'
import type { ViewerEmits, ViewerProps } from '../viewer.ts'

import { computed, onBeforeUnmount, onUpdated, ref, useTemplateRef, watch } from 'vue'
import blankVideo from '../img/blank.mp4'
import { logger } from '../services/logger.ts'
import { preloadMedia } from '../services/mediaPreloader.ts'
import { t } from '../utils/l10n.ts'
import { useMediaVolume } from './useMediaVolume.ts'
import { useViewerProps } from './useViewerProps.ts'

/** Marks the page furniture the viewer hides around a full screen player */
const HIDDEN_FULLSCREEN_CLASS = 'viewer__hidden-fullscreen'

/** `MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED`, which not every environment defines */
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

/** What the media player needs of the library drawing the controls */
export interface MediaPlayerAdapter {
	/** Go back to the start, paused, with the poster over it. False when there is no player yet */
	stop(): boolean
	/** Be told of every change of full screen, however it came about */
	onFullscreenChange(callback: (fullscreen: boolean) => void): void
	/** The controls, which the pointer can be over, or none if not drawn yet */
	controls(): Element[]
}

/**
 * Composable to play a media file in the viewer.
 *
 * @param forAudio Whether the player is used for audio files
 * @param props The viewer component props (filename, source, etc.)
 * @param emit The component emit function for viewer events
 * @param player The library drawing the controls
 */
export function useMediaPlayer(forAudio: boolean, props: ViewerProps, emit: EmitFn<ViewerEmits>, player: MediaPlayerAdapter) {
	const { filename, src } = useViewerProps(props)

	const video = useTemplateRef<HTMLVideoElement>('video')
	const audio = useTemplateRef<HTMLAudioElement>('audio')
	useMediaVolume(computed(() => video.value ?? audio.value))

	const fallback = ref(false)

	// Whether the element got as far as playing what it was given. The
	// fallback is for a source that does not load: an error after this one
	// is the playback failing, which another source does not mend
	let playable = false
	watch(src, () => {
		playable = false
	})

	// Whether the viewer was told it can show the player, and whether the
	// slideshow is held meanwhile for the media to start. Kept across the
	// fallback, which only changes the source the same file plays from
	let shown = false
	let holding = false
	watch(() => props.file.source, () => {
		shown = false
		holding = false
	})

	/**
	 * Tell Viewer that the video is ready to be shown
	 */
	function doneLoading() {
		playable = true
		show()
		release()
	}

	/**
	 * Tell the viewer, once, that the player can be shown.
	 */
	function show() {
		if (!shown) {
			shown = true
			emit('loaded')
		}
	}

	/**
	 * Show the player before the media can play, once its size is known, and
	 * hold the slideshow meanwhile: a slow video would otherwise be skipped
	 * with only its poster shown (nextcloud/viewer#39).
	 */
	function showBeforePlayable() {
		if (shown) {
			return
		}
		holding = true
		emit('update:playing', true)
		show()
	}

	/**
	 * Let the slideshow go on once the media can play or has failed, unless
	 * it is playing. A browser that refuses to autoplay leaves it paused,
	 * and the slideshow then moves on as it did before.
	 */
	function release() {
		if (!holding) {
			return
		}
		holding = false
		const media = (forAudio ? audio : video).value
		if (!media || media.paused) {
			emit('update:playing', false)
		}
	}

	/**
	 * Go back to the start once the media has played, showing its poster again.
	 *
	 * Rewound and paused rather than reloaded: the player shows the poster
	 * over media stopped at the start, and what the element already buffered
	 * is kept. Reloading it brought the poster back too, but every replay then
	 * downloaded the whole file again (nextcloud/viewer#2585).
	 */
	function donePlaying() {
		if (player.stop()) {
			return
		}

		const media = (forAudio ? audio : video).value
		// Should not happen™
		if (!media) {
			logger.error('Media element not found in donePlaying')
			return
		}
		media.pause()
		media.currentTime = 0
	}

	/**
	 * Fetch the file by hand once when the element cannot load it, and say
	 * why when that does not work either.
	 *
	 * @param event - The media element's error event
	 */
	async function onFail(event?: Event) {
		// If we fail on the blank media, don't do anything.
		// This is expected to cancel any network requests when switching files.
		if (src.value === blankVideo) {
			return
		}

		// Firefox without an audio device fails here on any sound it has
		// already loaded, and the element recovers from it on its own
		if (playable) {
			logger.warn(`Playback of file ${filename.value} failed after it loaded`, { error: (event?.target as HTMLMediaElement | null)?.error })
			return
		}

		if (fallback.value) {
			logger.error(`Loading of file ${filename.value} failed even after fallback`)
			// An end-to-end encrypted file fails the same way until its bytes
			// are fetched, so the format is only to blame once they have been
			const code = (event?.target as HTMLMediaElement | null)?.error?.code
			release()
			emit('errored', new Error(code === MEDIA_ERR_SRC_NOT_SUPPORTED
				? t('Your browser cannot play this file format.')
				: t('Failed to load media.')))
			return
		}

		// Try to load E2EE file as a fallback
		logger.error(`Loading of file ${filename.value} failed, falling back to fetching it by hand`)
		fallback.value = true
		try {
			src.value = await preloadMedia(props.file)
		} catch (error) {
			// The fallback fetch failed too: surface the error instead of staying
			// stuck on the loading spinner.
			logger.error(`Fallback fetch of ${filename.value} failed`, { error })
			release()
			emit('errored', new Error(t('Failed to load media.')))
		}
	}

	/**
	 * Hide, or bring back, the page around a full screen player.
	 *
	 * The elements are the server's, not ours, and a page that has neither
	 * (a public share, an app hosting the viewer itself) is not a reason to
	 * throw from a click handler.
	 *
	 * @param hidden - Whether the page around the player should be hidden
	 */
	function setPageHidden(hidden: boolean): void {
		for (const element of [document.body.querySelector('main'), document.body.querySelector('footer')]) {
			element?.classList.toggle(HIDDEN_FULLSCREEN_CLASS, hidden)
		}
	}

	// What the player says about its own full screen, rather than a count of
	// clicks on the button: the user also leaves full screen with Escape or
	// the browser's own control, and a count is then one behind for good,
	// leaving the header hidden on a page that is not full screen any more.
	player.onFullscreenChange(setPageHidden)

	// Stable handler references so listeners can be removed again and are never
	// bound more than once, even though onUpdated may run many times.
	const disableSwipe = () => emit('update:canSwipe', false)
	const enableSwipe = () => emit('update:canSwipe', true)

	// So the viewer's slideshow waits for the media instead of moving on mid-play
	const onPlay = () => emit('update:playing', true)
	const onPause = () => emit('update:playing', false)

	/** The controls the listeners are on, so they go on once. */
	let boundControls: Element[] = []

	/**
	 * Take the listeners off whatever they were bound to.
	 */
	function unbindControls() {
		boundControls.forEach((control) => {
			control.removeEventListener('mouseenter', disableSwipe)
			control.removeEventListener('mouseleave', enableSwipe)
		})
		boundControls = []
	}

	// For some reason the video controls don't get mounted to
	// the dom until after the component (Videos) is mounted,
	// using the mounted() hook will leave us with an empty array
	onUpdated(() => {
		const controls = player.controls()
		if (controls.length === 0) {
			logger.warn('Media player not initialized yet')
			return
		}

		// Every prop the viewer hands over runs this, a resize a great many
		// times over, and the controls are the same elements throughout:
		// leave them alone unless the player has actually rebuilt them.
		if (controls.length === boundControls.length && controls.every((control, index) => control === boundControls[index])) {
			return
		}
		unbindControls()

		// Prevent swiping to the next/previous item when scrubbing the timeline or changing volume.
		controls.forEach((control) => {
			control.addEventListener('mouseenter', disableSwipe)
			control.addEventListener('mouseleave', enableSwipe)
		})
		boundControls = controls
	})

	onBeforeUnmount(() => {
		// Remove control listeners to avoid leaks
		unbindControls()

		// Whatever the player was showing, the page it hid is still there
		setPageHidden(false)

		// Force stop any ongoing request
		logger.debug('Closing media stream', { filename: props.file.basename })
		video?.value?.pause?.()
	})

	return {
		doneLoading,
		donePlaying,
		onFail,
		onPause,
		onPlay,
		showBeforePlayable,
		// The source the element must show: the fallback replaces it here
		src,
		video,
	}
}
