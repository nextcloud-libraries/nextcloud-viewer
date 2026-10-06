/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type Plyr from 'plyr'
import type { MediaPlayerAdapter } from './useMediaPlayer.ts'

import { computed, useTemplateRef, watch } from 'vue'
import blankVideo from '../img/blank.mp4'
import { localizeSpeedLabels, plyrTranslations } from '../utils/plyrTranslations.ts'

/**
 * What the media player needs of plyr, and the options to hand it.
 *
 * Expects a `plyr` template ref on the `VuePlyr` component.
 *
 * @param forAudio Whether the player is used for audio files
 */
export function usePlyrAdapter(forAudio: boolean) {
	const plyr = useTemplateRef<{ player: Plyr, $el: HTMLElement }>('plyr')
	const player = computed<Plyr | undefined>(() => plyr.value?.player as Plyr | undefined)

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
	 * Relabel the speed menu in the user's locale.
	 *
	 * It is built from numbers plyr formats itself, which its i18n does not
	 * reach: once the controls exist, and again after every change of speed,
	 * as plyr writes the chosen one back as it formats it (`1.5×` in German).
	 */
	function relabelSpeed() {
		const root = plyr.value?.$el?.querySelector('video, audio')?.closest('.plyr')
		if (root) {
			localizeSpeedLabels(root)
		}
	}

	let onFullscreen: ((fullscreen: boolean) => void) | undefined
	const onEnterFullscreen = () => onFullscreen?.(true)
	const onExitFullscreen = () => onFullscreen?.(false)

	// What plyr says about its own full screen, rather than a count of clicks
	// on the button: the user also leaves full screen with Escape or the
	// browser's own control, and a count is then one behind for good. And its
	// changes of speed, which put back the label in plyr's own formatting.
	watch(player, (instance, previous) => {
		previous?.off('enterfullscreen', onEnterFullscreen)
		previous?.off('exitfullscreen', onExitFullscreen)
		previous?.off('ratechange', relabelSpeed)
		instance?.on('enterfullscreen', onEnterFullscreen)
		instance?.on('exitfullscreen', onExitFullscreen)
		instance?.on('ratechange', relabelSpeed)
	}, { immediate: true })

	const adapter: MediaPlayerAdapter = {
		ready: relabelSpeed,

		stop() {
			if (!player.value) {
				return false
			}
			// Plyr shows the poster over a player stopped at the start
			player.value.stop()
			return true
		},

		onFullscreenChange(callback) {
			onFullscreen = callback
		},

		controls() {
			if (!plyr.value?.player || !plyr.value.$el) {
				return []
			}
			return Array.from(plyr.value.$el.querySelectorAll('.plyr__controls__item'))
		},

		destroy() {
			// Guarded: a component torn down before plyr got as far as a player,
			// which a quick close is enough for, has nothing to stop
			player.value?.stop()
			player.value?.destroy()
		},
	}

	return { ...adapter, options }
}
