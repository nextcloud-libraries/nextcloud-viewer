import type { Mock } from 'vitest'
/**
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { ViewerProps } from '../../lib/viewer.ts'

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { makeFile } from '../factories.ts'

// Resolve/keep the real network-free path: preloadMedia is the only fetch the
// media components perform, so we replace it with a deterministic fake blob URL.
vi.mock('../../lib/services/mediaPreloader.ts', () => ({
	preloadMedia: vi.fn(async () => 'blob:mock-preloaded-media'),
}))

// An svg is read and sanitized rather than handed to the element, so the
// only request Images makes by itself is that one.
const axiosGet = vi.hoisted(() => vi.fn(async () => ({ data: '<svg/>' })))
vi.mock('@nextcloud/axios', () => ({ default: { get: axiosGet } }))

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
						off: vi.fn(),
						once: vi.fn(),
						stop: vi.fn(),
						destroy: vi.fn(),
						play: vi.fn(),
					},
				}
			},
			render() {
				// plyr wraps the media in a .plyr root, which the composable
				// looks for, and hangs its controls off it
				return h('div', { class: 'plyr vue-plyr-stub' }, [
					h('div', { class: 'plyr__controls' }, [
						h('button', { class: 'plyr__controls__item', 'data-plyr': 'play' }),
						h('button', { class: 'plyr__controls__item', 'data-plyr': 'fullscreen' }),
					]),
					this.$slots.default?.(),
				])
			},
		}),
	}
})

import Audios from '../../lib/components/Audios.vue'
import Images from '../../lib/components/Images.vue'
import Videos from '../../lib/components/Videos.vue'
import { usePlyrPlayer } from '../../lib/composables/usePlyrPlayer.ts'
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

	// The element's `src` is a URL: a name holding a `#` or a `?` cuts it
	// short unless it is encoded, and the image then fails to load.
	it('renders the encoded source of a file whose name needs it', async () => {
		const file = makeFile({ basename: 'a#b c?.jpg', mime: 'image/jpeg' })
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()

		expect(wrapper.find('img').attributes('src')).toBe(file.encodedSource)
	})

	it('renders the encoded source of a live photo', async () => {
		const photo = makeFile({ id: 1, basename: 'a#b.jpg', attributes: { 'metadata-files-live-photo': 2 } })
		const movie = makeFile({ id: 2, basename: 'a#b.mov', mime: 'video/quicktime' })
		const wrapper = mountImages({ file: photo, files: [photo, movie] })
		await flushPromises()

		expect(wrapper.find('video').attributes('src')).toBe(movie.encodedSource)
	})

	it('shows the hand-fetched bytes when the source fails to load', async () => {
		const file = makeFile({ basename: 'broken.jpg' })
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()

		await wrapper.find('img').trigger('error')
		await flushPromises()

		// First failure: fetch the file by hand, show that, and do not
		// surface an error yet. What is fetched has to reach the element:
		// the viewer is waiting for its `loaded` event to stop spinning.
		expect(preloadMediaMock).toHaveBeenCalledTimes(1)
		expect(preloadMediaMock).toHaveBeenCalledWith(file, expect.any(AbortSignal))
		expect(wrapper.find('img').attributes('src')).toBe('blob:mock-preloaded-media')
		expect(wrapper.emitted('errored')).toBeUndefined()
	})

	it('falls back for a file whose preview fails to load', async () => {
		const file = makeFile({ basename: 'previewed.jpg', attributes: { hasPreview: true } })
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()

		expect(wrapper.find('img').attributes('src')).toContain('/core/preview')

		await wrapper.find('img').trigger('error')
		await flushPromises()

		expect(wrapper.find('img').attributes('src')).toBe('blob:mock-preloaded-media')
		expect(wrapper.emitted('errored')).toBeUndefined()
	})

	it('reports a failure of the fallback itself', async () => {
		const file = makeFile({ basename: 'broken.jpg' })
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()

		await wrapper.find('img').trigger('error')
		await flushPromises()

		// The hand-fetched bytes fail too: nothing is left to show, so the
		// viewer has to hear about it rather than spin forever.
		await wrapper.find('img').trigger('error')
		await flushPromises()

		expect(preloadMediaMock).toHaveBeenCalledTimes(1)
		expect(wrapper.emitted('errored')).toHaveLength(1)
	})

	it('reports a hand fetch that throws', async () => {
		preloadMediaMock.mockRejectedValueOnce(new Error('403'))
		const file = makeFile({ basename: 'forbidden.jpg' })
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()

		await wrapper.find('img').trigger('error')
		await flushPromises()

		expect(wrapper.emitted('errored')).toHaveLength(1)
	})

	// An svg is only ever shown through the sanitizer: a raw blob of the
	// original bytes in the element's src would put the script back.
	it('never falls back to the raw bytes of an svg', async () => {
		const file = makeFile({ basename: 'drawing.svg', mime: 'image/svg+xml' })
		const wrapper = mountImages({ file, files: [file] })
		// The sanitizer arrives by a lazy import, which outlasts one flush
		await vi.waitFor(() => expect(wrapper.find('img').exists()).toBe(true))

		await wrapper.find('img').trigger('error')
		await flushPromises()
		await wrapper.find('img').trigger('error')
		await flushPromises()

		expect(preloadMediaMock).not.toHaveBeenCalled()
		expect(wrapper.find('img').attributes('src')).toBe(`data:image/svg+xml;base64,${btoa('<svg></svg>')}`)
		expect(wrapper.emitted('errored')).toHaveLength(1)
	})
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

// Two files can carry one name: a version of a file is served under its
// version id but reads as a date, and a rename keeps the same node. The
// source is what says which bytes to fetch.
describe('moving to another file of the same name', () => {
	it('reloads the image', async () => {
		const first = makeFile({ id: 1, basename: 'photo.jpg', displayname: 'Yesterday' })
		const second = makeFile({ id: 2, basename: 'older.jpg', displayname: 'Yesterday' })
		const wrapper = mountImages({ file: first, files: [first] })
		await flushPromises()
		expect(wrapper.find('img').attributes('src')).toBe(first.source)

		await wrapper.setProps({ file: second, files: [second] })
		await flushPromises()

		expect(wrapper.find('img').attributes('src')).toBe(second.source)
	})

	it('reloads the media player', async () => {
		const first = makeFile({ id: 1, basename: 'clip.mp4', mime: 'video/mp4', displayname: 'Yesterday' })
		const second = makeFile({ id: 2, basename: 'older.mp4', mime: 'video/mp4', displayname: 'Yesterday' })
		const wrapper = mount(Videos, { props: makeProps({ file: first, files: [first] }) })
		await flushPromises()
		expect(wrapper.find('video').attributes('src')).toBe(first.encodedSource)

		await wrapper.setProps({ file: second, files: [second] })
		await flushPromises()

		expect(wrapper.find('video').attributes('src')).toBe(second.encodedSource)
	})
})

describe('an image that cannot be read at all', () => {
	// An svg is fetched to be sanitized, and an E2EE file is fetched by
	// hand: a request that rejects there left the element with nothing and
	// the viewer waiting on a `loaded` event that could never come
	it('reports a request that rejects on the first load', async () => {
		axiosGet.mockRejectedValueOnce(new Error('503'))
		const logged = vi.spyOn(logger, 'error').mockImplementation(() => {})
		const file = makeFile({ basename: 'drawing.svg', mime: 'image/svg+xml' })

		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()

		expect(wrapper.emitted('errored')).toHaveLength(1)
		expect(logged).toHaveBeenCalled()
	})
})

describe('the pointers on an image', () => {
	/**
	 * A pointer event jsdom will accept: it has no PointerEvent, and the
	 * coordinates of a MouseEvent cannot be set after the fact.
	 *
	 * @param type - The event name
	 * @param pointerId - Which pointer it is
	 * @param at - Where it is, in both axes
	 */
	function pointer(type: string, pointerId: number, at = 0): Event {
		const event = new MouseEvent(type, { clientX: at, clientY: at, bubbles: true, cancelable: true })
		Object.defineProperty(event, 'pointerId', { value: pointerId })
		return event
	}

	/**
	 * Mount an image and return a way to put pointers on it.
	 */
	async function mountWithPointers() {
		const wrapper = mountImages()
		await flushPromises()
		const image = wrapper.find('img').element
		const send = async (type: string, pointerId: number, at?: number) => {
			image.dispatchEvent(pointer(type, pointerId, at))
			await nextTick()
		}
		const zoomed = () => wrapper.find('img').attributes('class')?.includes('zoomed') ?? false
		return { wrapper, send, zoomed }
	}

	it('takes back only the pointer that was lifted', async () => {
		const { send, zoomed } = await mountWithPointers()
		await send('pointerdown', 1, 0)
		await send('pointerdown', 2, 40)

		// A pointer that went down somewhere else, so this element never
		// cached it: splice reads its index of -1 as the last entry and
		// drops a finger that is still on the screen
		await send('pointerup', 99)
		// Both fingers are still down, so this is still a pinch, and moving
		// one of them apart zooms
		await send('pointermove', 2, 200)

		expect(zoomed()).toBe(true)
	})

	// The browser takes a pointer back when it turns the gesture into one of
	// its own, and the `up` that would have ended it never arrives
	it('lets go of a pointer the browser cancels', async () => {
		const { wrapper, send, zoomed } = await mountWithPointers()
		await send('pointerdown', 1, 0)
		expect(wrapper.emitted('update:canSwipe')).toBeUndefined()

		await send('pointercancel', 1)
		// One finger again, so nothing here is a pinch
		await send('pointerdown', 2, 0)
		await send('pointermove', 2, 200)

		expect(zoomed()).toBe(false)
		expect(wrapper.emitted('update:canSwipe')).toEqual([[true]])
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

describe('the page around a full screen player', () => {
	/**
	 * Mount Videos with the page furniture the server renders around it.
	 *
	 * @param withPage - Whether to give the page a main and a footer at all
	 */
	async function mountPlayer(withPage = true) {
		if (withPage) {
			document.body.innerHTML = '<main></main><footer></footer>'
		}
		const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4' })
		const wrapper = mount(Videos, { props: makeProps({ file, files: [file] }), attachTo: document.body })
		await flushPromises()
		const player = wrapper.findComponent({ name: 'VuePlyrStub' }).vm.player as { on: Mock }
		/** Run whatever the composable registered for one of plyr's own events */
		const fire = (event: string) => {
			const call = player.on.mock.calls.find(([name]) => name === event)
			expect(call, `nothing listens for ${event}`).toBeDefined()
			;(call![1] as () => void)()
		}
		return { wrapper, fire }
	}

	const hidden = () => Array.from(document.querySelectorAll('.viewer__hidden-fullscreen')).map((el) => el.tagName.toLowerCase())

	afterEach(() => {
		document.body.innerHTML = ''
	})

	it('hides it while the player is full screen', async () => {
		const { fire } = await mountPlayer()

		fire('enterfullscreen')

		expect(hidden()).toEqual(['main', 'footer'])
	})

	// The button is not the only way out: Escape and the browser's own
	// control leave full screen too, and the page has to come back for those
	it('brings it back however full screen is left', async () => {
		const { fire } = await mountPlayer()
		fire('enterfullscreen')

		fire('exitfullscreen')

		expect(hidden()).toEqual([])
	})

	it('brings it back when the player goes away', async () => {
		const { wrapper, fire } = await mountPlayer()
		fire('enterfullscreen')

		wrapper.unmount()

		expect(hidden()).toEqual([])
	})

	// A public share, or an app hosting the viewer, renders neither
	it('is not a reason to throw when the page has none', async () => {
		const { fire } = await mountPlayer(false)

		expect(() => fire('enterfullscreen')).not.toThrow()
	})
})

describe('a player torn down early', () => {
	// Closing the viewer straight after opening it unmounts the component
	// before plyr has a player to stop
	it('unmounts without a player to stop', () => {
		const Host = defineComponent({
			setup() {
				const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4' })
				usePlyrPlayer(false, makeProps({ file, files: [file] }), (() => {}) as never)
				// No `plyr` ref in the template, so the player never arrives
				return () => h('div')
			},
		})
		const wrapper = mount(Host)

		expect(() => wrapper.unmount()).not.toThrow()
	})
})

describe('the listeners on the plyr controls', () => {
	// Every prop the viewer hands over runs the update hook, and a resize
	// runs it a great many times over. The controls are the same elements.
	it('go on once, not on every update', async () => {
		const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4' })
		const wrapper = mount(Videos, { props: makeProps({ file, files: [file] }) })
		await flushPromises()

		// The viewer resizes the handler by handing it new bounds, and the
		// first of those is what the controls are bound on
		await wrapper.setProps({ maxWidth: 900 })
		const controls = wrapper.findAll('.plyr__controls__item').map((control) => control.element)
		const bind = controls.map((control) => vi.spyOn(control, 'addEventListener'))

		await wrapper.setProps({ maxWidth: 800 })
		await wrapper.setProps({ maxWidth: 700 })

		expect(controls).toHaveLength(2)
		expect(bind.map((spy) => spy.mock.calls.length)).toEqual([0, 0])
	})

	it('come off when the player goes away', async () => {
		const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4' })
		const wrapper = mount(Videos, { props: makeProps({ file, files: [file] }) })
		await flushPromises()
		await wrapper.setProps({ maxWidth: 900 })

		const controls = wrapper.findAll('.plyr__controls__item').map((control) => control.element)
		const unbind = controls.map((control) => vi.spyOn(control, 'removeEventListener'))

		wrapper.unmount()

		expect(unbind.every((spy) => spy.mock.calls.length > 0)).toBe(true)
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
