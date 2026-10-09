/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { MediaPlayerAdapter } from './useMediaPlayer.ts'

import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { formatRate } from '../utils/playerTranslations.ts'

/** What the viewer reads of, and asks of, a Video.js player store */
interface PlayerStore {
	readonly paused: boolean
	/** Absent from the audio player, which has no full screen */
	readonly isFullscreen?: boolean
	/** The media the store is attached to, absent until then */
	readonly target?: unknown
	pause(): void
	seek(time: number): Promise<number>
	subscribe(callback: () => void): () => void
}

/**
 * What the media player needs of Video.js.
 *
 * Expects a `player` template ref on the `<video-player>` or `<audio-player>`,
 * with the packaged skin inside it.
 */
export function useVideojsAdapter() {
	const player = useTemplateRef<HTMLElement & { store: PlayerStore }>('player')

	/** Back at its start once played, which brings its poster back */
	const stopped = ref(false)

	let onFullscreen: ((fullscreen: boolean) => void) | undefined
	let fullscreen = false
	let unsubscribe: (() => void) | undefined

	/**
	 * The skin draws its controls in a shadow root of its own, open, which
	 * is the way to the controls the viewer has to reach.
	 */
	function skin(): ShadowRoot | null | undefined {
		return player.value?.querySelector('video-skin, audio-skin')?.shadowRoot
	}

	/**
	 * Follow what the player says of itself: its full screen, however it is
	 * entered or left (the button, Escape, the browser's own control), and
	 * its playing again once stopped.
	 *
	 * @param store - The player's store
	 */
	function follow(store: PlayerStore) {
		const sync = () => {
			if (Boolean(store.isFullscreen) !== fullscreen) {
				fullscreen = Boolean(store.isFullscreen)
				onFullscreen?.(fullscreen)
			}
			if (!store.paused) {
				stopped.value = false
			}
		}
		sync()
		return store.subscribe(sync)
	}

	watch(player, (element) => {
		unsubscribe?.()
		unsubscribe = element ? follow(element.store) : undefined

		// Video.js writes the speeds as `1.5×` whatever the language
		skin()?.querySelectorAll<HTMLElement & { formatRate: (rate: number) => string }>('media-playback-rate-radio-group')
			.forEach((group) => {
				group.formatRate = formatRate
			})
	})

	onBeforeUnmount(() => unsubscribe?.())

	const adapter: MediaPlayerAdapter = {
		stop() {
			const store = player.value?.store
			if (!store?.target) {
				return false
			}
			store.pause()
			store.seek(0)
			stopped.value = true
			return true
		},

		onFullscreenChange(callback) {
			onFullscreen = callback
		},

		controls() {
			const controls = skin()?.querySelector('media-controls')
			return controls ? [controls] : []
		},
	}

	return { ...adapter, stopped }
}
