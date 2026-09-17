/*!
 * SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type Plyr from 'plyr'
import type { EmitFn } from 'vue'
import type { ViewerEmits, ViewerProps } from '../viewer.ts'

import { computed, onBeforeUnmount, onUpdated, ref, useTemplateRef, watch } from 'vue'
import blankVideo from '../img/blank.mp4'
import { logger } from '../services/logger.ts'
import { preloadMedia } from '../services/mediaPreloader.ts'
import { t } from '../utils/l10n.ts'
import { localizeSpeedLabels, plyrTranslations } from '../utils/plyrTranslations.ts'
import { useViewerProps } from './useViewerProps.ts'

/** Marks the page furniture the viewer hides around a full screen player */
const HIDDEN_FULLSCREEN_CLASS = 'viewer__hidden-fullscreen'

/**
 * Composable to setup a Plyr player instance.
 *
 * @param forAudio Whether the player is used for audio files
 * @param props The viewer component props (filename, source, etc.)
 * @param emit The component emit function for viewer events
 */
export function usePlyrPlayer(forAudio: boolean, props: ViewerProps, emit: EmitFn<ViewerEmits>) {
	const { filename, src } = useViewerProps(props)

	const plyr = useTemplateRef<{ player: Plyr, $el: HTMLElement }>('plyr')
	const player = computed<Plyr | undefined>(() => plyr.value?.player as Plyr | undefined)
	const video = useTemplateRef<HTMLVideoElement>('video')
	const audio = useTemplateRef<HTMLAudioElement>('audio')

	const fallback = ref(false)

	const options = computed(() => {
		return {
			autoplay: true,
			// Plyr labels its own controls, in English, unless given these
			i18n: plyrTranslations,
			// Used to reset the video streams https://github.com/sampotts/plyr#javascript-1
			blankVideo,
			controls: [
				'play-large',
				'play',
				'progress',
				'current-time',
				'mute',
				'volume',
				...forAudio ? ['settings'] : ['captions', 'settings', 'fullscreen'],
			],
			loadSprite: false,
			fullscreen: {
				iosNative: true,
			},
		}
	})

	/**
	 * Tell Viewer that the video is ready to be shown
	 */
	function doneLoading() {
		// The speed menu is built from numbers plyr formats itself, which its
		// i18n does not reach, so those are relabelled once the controls exist
		const root = (forAudio ? audio : video).value?.closest('.plyr')
		if (root) {
			localizeSpeedLabels(root)
		}
		emit('loaded')
	}

	/**
	 * Reset video after playing to show poster again
	 */
	function donePlaying() {
		const media = forAudio ? audio : video
		// Should not happen™
		if (!media.value) {
			logger.error('Media element not found in donePlaying')
			return
		}

		// reset and show poster after play
		media.value.autoplay = false
		media.value.load()
	}

	/**
	 * Fallback to the original image if not already done
	 */
	async function onFail() {
		// If we fail on the blank media, don't do anything.
		// This is expected to cancel any network requests when switching files.
		if (src.value === blankVideo) {
			return
		}

		if (fallback.value) {
			logger.error(`Loading of file ${filename.value} failed even after fallback`)
			emit('errored', new Error(t('Failed to load media.')))
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

	const onEnterFullscreen = () => setPageHidden(true)
	const onExitFullscreen = () => setPageHidden(false)

	// What plyr says about its own full screen, rather than a count of clicks
	// on the button: the user also leaves full screen with Escape or the
	// browser's own control, and a count is then one behind for good, leaving
	// the header hidden on a page that is not full screen any more.
	watch(player, (instance, previous) => {
		previous?.off('enterfullscreen', onEnterFullscreen)
		previous?.off('exitfullscreen', onExitFullscreen)
		instance?.on('enterfullscreen', onEnterFullscreen)
		instance?.on('exitfullscreen', onExitFullscreen)
	}, { immediate: true })

	// Stable handler references so listeners can be removed again and are never
	// bound more than once, even though onUpdated may run many times.
	const disableSwipe = () => emit('update:canSwipe', false)
	const enableSwipe = () => emit('update:canSwipe', true)

	// So the viewer's slideshow waits for the media instead of moving on mid-play
	const onPlay = () => emit('update:playing', true)
	const onPause = () => emit('update:playing', false)

	/**
	 * Get the current plyr control items, or an empty array if not ready.
	 */
	function getPlyrControls(): Element[] {
		if (!plyr.value?.player || !plyr.value.$el) {
			return []
		}
		return Array.from(plyr.value.$el.querySelectorAll('.plyr__controls__item'))
	}

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
		const plyrControls = getPlyrControls()
		if (plyrControls.length === 0) {
			logger.warn('Plyr player not initialized yet')
			return
		}

		// Every prop the viewer hands over runs this, a resize a great many
		// times over, and the controls are the same elements throughout:
		// leave them alone unless plyr has actually rebuilt them.
		if (plyrControls.length === boundControls.length && plyrControls.every((control, index) => control === boundControls[index])) {
			return
		}
		unbindControls()

		// Prevent swiping to the next/previous item when scrubbing the timeline or changing volume.
		plyrControls.forEach((control) => {
			control.addEventListener('mouseenter', disableSwipe)
			control.addEventListener('mouseleave', enableSwipe)
		})
		boundControls = plyrControls
	})

	onBeforeUnmount(() => {
		// Remove control listeners to avoid leaks
		unbindControls()

		// Whatever the player was showing, the page it hid is still there
		setPageHidden(false)

		// Force stop any ongoing request
		logger.debug('Closing media stream', { filename: props.file.basename })
		video?.value?.pause?.()
		// Guarded: a component torn down before plyr got as far as a player,
		// which a quick close is enough for, has nothing to stop
		player.value?.stop()
		player.value?.destroy()
	})

	return {
		doneLoading,
		donePlaying,
		onFail,
		onPause,
		onPlay,
		options,
		video,
	}
}
