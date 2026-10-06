/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { MediaPlayerAdapter } from './useMediaPlayer.ts'

import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

/** What the viewer reads of, and asks of, a Video.js player store */
interface PlayerStore {
	readonly paused: boolean
	/** Absent from the audio player, which has no full screen */
	readonly isFullscreen?: boolean
	readonly playbackRate: number
	/** The media the store is attached to, absent until then */
	readonly target?: unknown
	pause(): void
	seek(time: number): Promise<number>
	subscribe(callback: () => void): () => void
}

/**
 * What the media player needs of Video.js.
 *
 * Expects a `player` template ref on the `<video-player>` or `<audio-player>`.
 */
export function useVideojsAdapter() {
	const player = useTemplateRef<HTMLElement & { store: PlayerStore }>('player')

	/** Back at its start once played, which brings its poster back */
	const stopped = ref(false)
	/** The playback rate, for the controls that show it */
	const rate = ref(1)

	let onFullscreen: ((fullscreen: boolean) => void) | undefined
	let fullscreen = false
	let unsubscribe: (() => void) | undefined

	/**
	 * Follow what the player says of itself: its full screen, however it is
	 * entered or left (the button, Escape, the browser's own control), its
	 * speed, and its playing again once stopped.
	 *
	 * @param store - The player's store
	 */
	function follow(store: PlayerStore) {
		const sync = () => {
			if (Boolean(store.isFullscreen) !== fullscreen) {
				fullscreen = Boolean(store.isFullscreen)
				onFullscreen?.(fullscreen)
			}
			rate.value = store.playbackRate
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
			const controls = player.value?.querySelector('media-controls-content')
			return controls ? [controls] : []
		},
	}

	return { ...adapter, stopped, rate }
}
