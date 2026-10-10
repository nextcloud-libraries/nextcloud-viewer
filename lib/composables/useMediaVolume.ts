/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Ref } from 'vue'

import debounce from 'debounce'
import { onBeforeUnmount, watch } from 'vue'
import { useViewerSettings } from './useViewerSettings.ts'

/** How long the volume has to stay put before it is saved, in milliseconds */
const SAVE_DELAY = 500

/**
 * Play a media element at the volume the user last chose, muted or not, and
 * keep what they change for the next one.
 *
 * @param media - The video or audio element, once there is one
 */
export function useMediaVolume(media: Readonly<Ref<HTMLMediaElement | null>>) {
	const { volume, muted, setVolume, setMuted } = useViewerSettings()

	// Once the slider stops: dragging it changes the volume many times
	const save = debounce((element: HTMLMediaElement) => {
		const percent = Math.round(element.volume * 100)
		// Setting the volume below fires the event too, with what is kept already
		if (percent !== volume.value) {
			setVolume(percent)
		}
		if (element.muted !== muted.value) {
			setMuted(element.muted)
		}
	}, SAVE_DELAY)

	/**
	 * @param event - The change of volume
	 */
	function onVolumeChange(event: Event) {
		save(event.target as HTMLMediaElement)
	}

	watch(media, (element, previous) => {
		previous?.removeEventListener('volumechange', onVolumeChange)
		if (!element) {
			return
		}
		element.volume = volume.value / 100
		element.muted = muted.value
		element.addEventListener('volumechange', onVolumeChange)
	}, { immediate: true })

	onBeforeUnmount(() => {
		// What was changed last is kept even when the viewer closes right away
		save.flush()
		media.value?.removeEventListener('volumechange', onVolumeChange)
	})
}
