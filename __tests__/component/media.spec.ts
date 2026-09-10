/**
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { ViewerProps } from '../../lib/viewer.ts'

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFile } from '../factories.ts'

// Resolve/keep the real network-free path: preloadMedia is the only fetch the
// media components perform, so we replace it with a deterministic fake blob URL.
vi.mock('../../lib/services/mediaPreloader.ts', () => ({
	preloadMedia: vi.fn(async () => 'blob:mock-preloaded-media'),
}))

// imagePath is evaluated at module load of usePlyrPlayer (blank.mp4). Keep the
// rest of the router real; only pin the two URL helpers so tests never depend on
// the OC bootstrap globals.
vi.mock('@nextcloud/router', async (importOriginal) => ({
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest importOriginal idiom
	...(await importOriginal<typeof import('@nextcloud/router')>()),
	imagePath: () => '/apps/viewer/img/blank.mp4',
	generateUrl: (url: string) => url,
}))

// plyr is heavy and DOM-driven; stub the class the composable references by type.
vi.mock('plyr', () => ({
	default: class PlyrStub {
		on = vi.fn()
		once = vi.fn()
		off = vi.fn()
		destroy = vi.fn()
		stop = vi.fn()
		play = vi.fn()
		pause = vi.fn()
	},
}))

// @skjnldsv/vue-plyr wraps plyr in a Vue component. Replace it with a passthrough
// that renders its default slot (so the inner <video>/<audio> still mounts) and
// exposes a `player` object so the composable's lifecycle hooks never throw.
const localizeSpeedLabels = vi.fn()
vi.mock('../../lib/utils/plyrTranslations.ts', async (importOriginal) => ({
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest importOriginal idiom
	...await importOriginal<typeof import('../../lib/utils/plyrTranslations.ts')>(),
	localizeSpeedLabels: (root: ParentNode) => localizeSpeedLabels(root),
}))

vi.mock('@skjnldsv/vue-plyr', async () => {
	const { defineComponent, h } = await import('vue')
	return {
		default: defineComponent({
			name: 'VuePlyrStub',
			// Declared so a test can read what the component hands plyr
			props: { options: { type: Object, default: () => ({}) } },
			data() {
				return {
					player: {
						on: vi.fn(),
						once: vi.fn(),
						stop: vi.fn(),
						destroy: vi.fn(),
						play: vi.fn(),
					},
				}
			},
			render() {
				// plyr wraps the media in a .plyr root, which the composable looks for
				return h('div', { class: 'plyr vue-plyr-stub' }, this.$slots.default?.())
			},
		}),
	}
})

import Audios from '../../lib/components/Audios.vue'
import Images from '../../lib/components/Images.vue'
import Videos from '../../lib/components/Videos.vue'
import { logger } from '../../lib/services/logger.ts'
import { preloadMedia } from '../../lib/services/mediaPreloader.ts'

const preloadMediaMock = vi.mocked(preloadMedia)

/**
 * Build the full ViewerProps set with sensible defaults for a mounted media component.
 *
 * @param overrides - Props to override
 */
function makeProps(overrides: Partial<ViewerProps> = {}): ViewerProps {
	const file = overrides.file ?? makeFile()
	return {
		file,
		files: [file],
		maxHeight: 1000,
		maxWidth: 1000,
		editing: false,
		isSidebarShown: false,
		...overrides,
	}
}

/**
 * Mount Images.vue.
 *
 * @param overrides - Props to override
 */
function mountImages(overrides: Partial<ViewerProps> = {}) {
	return mount(Images, {
		props: makeProps(overrides),
	})
}

beforeEach(() => {
	preloadMediaMock.mockClear()
})

describe('Images.vue', () => {
	it('shows a localSource (e.g. a just-edited image) without fetching', async () => {
		const wrapper = mountImages({ localSource: 'blob:edited' })
		await flushPromises()

		expect(wrapper.find('img').attributes('src')).toBe('blob:edited')
		expect(preloadMediaMock).not.toHaveBeenCalled()
	})

	it('renders the source directly (no preview) without any network call', async () => {
		const file = makeFile({ basename: 'photo.jpg', mime: 'image/jpeg' })
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()

		expect(wrapper.find('img').attributes('src')).toBe(file.source)
		expect(preloadMediaMock).not.toHaveBeenCalled()
	})

	it('falls back to preloadMedia on the first load error without emitting errored', async () => {
		const file = makeFile({ basename: 'broken.jpg' })
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()

		await wrapper.find('img').trigger('error')
		await flushPromises()

		// First failure: fetch the file by hand, do not surface an error yet.
		expect(preloadMediaMock).toHaveBeenCalledTimes(1)
		expect(preloadMediaMock).toHaveBeenCalledWith(file)
		expect(wrapper.emitted('errored')).toBeUndefined()
	})

	// The double-failure path (the hand-fetched fallback also fails → `errored`)
	// needs a real <img> remount to re-arm the `.once` @error handler, which the
	// viewer no longer drives from Images, so it is not unit-testable here.
})

describe('a live photo', () => {
	/**
	 * Mount Images on the still half of a live photo, with its video peer,
	 * and get as far as the state where the play button is rendered: the
	 * button is placed from the measured media, which jsdom reports as zero
	 * unless the intrinsic size is given to it.
	 *
	 * @param ready - Whether to report the video as playable
	 */
	async function mountLivePhoto(ready = true) {
		const photo = makeFile({ id: 1, basename: 'IMG_1234.jpg', attributes: { 'metadata-files-live-photo': 2 } })
		const movie = makeFile({ id: 2, basename: 'IMG_1234.mov', mime: 'video/quicktime' })
		const wrapper = mountImages({ file: photo, files: [photo, movie] })
		await flushPromises()

		const video = wrapper.find('video').element as HTMLVideoElement
		Object.defineProperty(video, 'videoWidth', { value: 320, configurable: true })
		Object.defineProperty(video, 'videoHeight', { value: 240, configurable: true })
		await wrapper.find('video').trigger('loadedmetadata')
		if (ready) {
			await wrapper.find('video').trigger('canplaythrough')
		}
		await flushPromises()

		return { wrapper, video, photo, movie }
	}

	// Hovering the button is not a user gesture, so a clip with a sound
	// track is refused outright by the browser's autoplay policy
	it('is muted, as nothing else may play on hover', async () => {
		const { video } = await mountLivePhoto()

		expect(video.muted).toBe(true)
	})

	it('says what its button does, in an attribute browsers support', async () => {
		const { wrapper } = await mountLivePhoto()

		const button = wrapper.find('.live-photo_play_button')
		expect(button.attributes('aria-label')).toBe('Play the live photo')
		// aria-description reaches neither Firefox nor Safari
		expect(button.attributes('aria-description')).toBeUndefined()
	})

	it('does not leave a rejection behind when the browser refuses to play', async () => {
		const { wrapper, video } = await mountLivePhoto()
		const refused = new DOMException('play() failed because the user did not interact', 'NotAllowedError')
		video.play = vi.fn().mockRejectedValue(refused)
		const logged = vi.spyOn(logger, 'debug').mockImplementation(() => {})

		await wrapper.find('.live-photo_play_button').trigger('pointerenter')
		await flushPromises()

		expect(video.play).toHaveBeenCalled()
		expect(logged).toHaveBeenCalledWith('The browser refused to play the live photo', { error: refused })
	})
})

describe('Videos.vue (smoke)', () => {
	// The speed menu is built from numbers plyr formats itself, which its own
	// i18n never reaches, so it is relabelled once the controls exist
	it('relabels the speed menu once the media is ready', async () => {
		localizeSpeedLabels.mockClear()
		const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4' })
		const wrapper = mount(Videos, { props: makeProps({ file, files: [file] }) })
		await flushPromises()

		await wrapper.find('video').trigger('canplay')
		await flushPromises()

		expect(localizeSpeedLabels).toHaveBeenCalledOnce()
		expect(wrapper.emitted('loaded')).toBeTruthy()
	})

	// Plyr labels its own controls in English unless it is handed these
	it('hands plyr the translated control labels', async () => {
		const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4' })
		const wrapper = mount(Videos, { props: makeProps({ file, files: [file] }) })
		await flushPromises()

		const options = wrapper.findComponent({ name: 'VuePlyrStub' }).props('options') as { i18n?: Record<string, string> }
		expect(options.i18n).toBeDefined()
		expect(options.i18n).toHaveProperty('play')
	})
})

describe('Audios.vue (smoke)', () => {
	it('mounts and renders an <audio> element', async () => {
		const file = makeFile({ basename: 'song.mp3', mime: 'audio/mpeg' })
		const wrapper = mount(Audios, { props: makeProps({ file, files: [file] }) })
		await flushPromises()

		expect(wrapper.find('audio').exists()).toBe(true)
	})
})
