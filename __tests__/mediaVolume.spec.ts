/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, useTemplateRef } from 'vue'

const put = vi.hoisted(() => vi.fn())
vi.mock('@nextcloud/initial-state', () => ({ loadState: () => ({ slideshow_delay: 5, volume: 40, muted: true }) }))
vi.mock('@nextcloud/axios', () => ({ default: { put } }))
vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn() }))

/** A player playing at the volume the user keeps, once it has its element */
async function mountPlayer() {
	// Fresh settings each time: they are kept for the whole page
	vi.resetModules()
	const { useMediaVolume } = await import('../lib/composables/useMediaVolume.ts')
	const wrapper = mount(defineComponent({
		setup() {
			useMediaVolume(useTemplateRef<HTMLMediaElement>('media'))
			return () => h('audio', { ref: 'media' })
		},
	}))
	await nextTick()
	return { wrapper, media: wrapper.element as HTMLAudioElement }
}

/**
 * Change the volume the way the player's controls do
 *
 * @param media - The element
 * @param volume - From 0 to 1
 * @param muted - Whether it is muted
 */
function change(media: HTMLMediaElement, volume: number, muted = media.muted) {
	media.volume = volume
	media.muted = muted
	media.dispatchEvent(new Event('volumechange'))
}

beforeEach(() => {
	vi.useFakeTimers()
	put.mockReset()
	put.mockResolvedValue({})
})

afterEach(() => {
	vi.useRealTimers()
})

describe('the volume of a player', () => {
	it('starts where the user left it', async () => {
		const { media } = await mountPlayer()

		expect(media.volume).toBe(0.4)
		expect(media.muted).toBe(true)
	})

	it('is kept once the slider stops, not on every step', async () => {
		const { media } = await mountPlayer()

		change(media, 0.5)
		change(media, 0.6)
		change(media, 0.7)
		expect(put).not.toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(500)
		expect(put).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('/config/volume'), { value: 70 })
	})

	it('keeps muting apart from the volume', async () => {
		const { media } = await mountPlayer()

		change(media, 0.4, false)
		await vi.advanceTimersByTimeAsync(500)

		expect(put).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('/config/muted'), { value: false })
	})

	it('keeps the last change when the viewer closes before it is saved', async () => {
		const { wrapper, media } = await mountPlayer()

		change(media, 0.2)
		wrapper.unmount()

		expect(put).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('/config/volume'), { value: 20 })
	})
})
