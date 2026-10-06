import type { VueWrapper } from '@vue/test-utils'
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
	preloadPreview: vi.fn(async () => 'blob:mock-preloaded-preview'),
	preloadImage: vi.fn(async () => 0),
	preloadImageSize: vi.fn(async () => ({ width: 640, height: 360 })),
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
import { preloadImage, preloadMedia, preloadPreview } from '../../lib/services/mediaPreloader.ts'

const preloadMediaMock = vi.mocked(preloadMedia)
const preloadPreviewMock = vi.mocked(preloadPreview)
const preloadImageMock = vi.mocked(preloadImage)

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
	preloadPreviewMock.mockClear()
	preloadImageMock.mockReset()
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

	it('asks for the preview by hand when the share forbids downloading', async () => {
		// The share refuses the file itself, so fetching it would fail the
		// same way the element's own request just did. Only the preview is
		// still available, and only to a request that carries the header.
		const file = makeFile({
			basename: 'restricted.jpg',
			attributes: {
				hasPreview: true,
				// Named the way the dav property arrives on the node
				'share-attributes': JSON.stringify([{ scope: 'permissions', key: 'download', value: false }]),
			},
		})
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()

		await wrapper.find('img').trigger('error')
		await flushPromises()

		expect(preloadPreviewMock).toHaveBeenCalledTimes(1)
		expect(preloadPreviewMock.mock.calls[0]![0]).toContain('/core/preview')
		expect(preloadMediaMock).not.toHaveBeenCalled()
		expect(wrapper.find('img').attributes('src')).toBe('blob:mock-preloaded-preview')
		expect(wrapper.emitted('errored')).toBeUndefined()
	})

	it('releases the blob it fetched when the viewer closes', async () => {
		// An object URL holds its blob until it is revoked, so a folder of
		// these would otherwise stay in memory for as long as the viewer is
		// open
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
		const file = makeFile({ basename: 'broken.jpg' })
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()
		await wrapper.find('img').trigger('error')
		await flushPromises()

		wrapper.unmount()

		expect(revoke).toHaveBeenCalledWith('blob:mock-preloaded-media')
		revoke.mockRestore()
	})

	it('releases the previous blob when it fetches another', async () => {
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
		const first = makeFile({ basename: 'first.jpg' })
		const second = makeFile({ basename: 'second.jpg' })
		const wrapper = mountImages({ file: first, files: [first, second] })
		await flushPromises()
		await wrapper.find('img').trigger('error')
		await flushPromises()
		expect(revoke).not.toHaveBeenCalled()

		preloadMediaMock.mockResolvedValueOnce('blob:second-media')
		await wrapper.setProps({ file: second })
		await flushPromises()
		await wrapper.find('img').trigger('error')
		await flushPromises()

		expect(revoke).toHaveBeenCalledWith('blob:mock-preloaded-media')
		revoke.mockRestore()
		wrapper.unmount()
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

	// plyr writes the chosen speed back in its own formatting, `1.5×` where
	// the user reads `1,5×`
	it('relabels the speed menu again after a change of speed', async () => {
		localizeSpeedLabels.mockClear()
		const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4' })
		const wrapper = mount(Videos, { props: makeProps({ file, files: [file] }) })
		await flushPromises()
		await wrapper.find('video').trigger('canplay')
		const player = wrapper.findComponent({ name: 'VuePlyrStub' }).vm.player as { on: Mock }
		const onRateChange = player.on.mock.calls.find(([event]) => event === 'ratechange')?.[1] as () => void

		onRateChange()

		expect(localizeSpeedLabels).toHaveBeenCalledTimes(2)
	})

	it.each([
		['a small clip at its own size', 320, 240, '320px', '240px'],
		['a large one shrunk to fit', 3200, 2400, '1000px', '750px'],
	])('shows %s', async (_name, videoWidth, videoHeight, width, height) => {
		const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4' })
		const wrapper = mount(Videos, { props: makeProps({ file, files: [file] }) })
		await flushPromises()
		const video = wrapper.find('video').element as HTMLVideoElement
		Object.defineProperty(video, 'videoWidth', { value: videoWidth, configurable: true })
		Object.defineProperty(video, 'videoHeight', { value: videoHeight, configurable: true })

		await wrapper.find('video').trigger('loadedmetadata')

		expect(video.style.width).toBe(width)
		expect(video.style.height).toBe(height)
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

describe('a video that has played to the end', () => {
	// What a user puts beside a film to show before and after it plays:
	// a picture of the same name in the same folder
	async function mountWithPoster() {
		const movie = makeFile({ basename: 'trailer.webm', mime: 'video/webm' })
		const poster = makeFile({ basename: 'trailer.jpg', mime: 'image/jpeg' })
		const wrapper = mount(Videos, { props: makeProps({ file: movie, files: [movie, poster] }) })
		await flushPromises()
		const video = wrapper.find('video').element as HTMLVideoElement
		video.load = vi.fn()
		const player = wrapper.findComponent({ name: 'VuePlyrStub' }).vm.player as { stop: Mock }
		return { wrapper, video, player, poster }
	}

	it('shows the picture of the same name beside it as its poster', async () => {
		const { wrapper, poster } = await mountWithPoster()

		expect(wrapper.find('video').attributes('poster')).toBe(poster.encodedSource)
	})

	it('goes back to its poster without downloading the video again', async () => {
		const { wrapper, video, player, poster } = await mountWithPoster()

		await wrapper.find('video').trigger('ended')

		// Stopped at the start is what puts plyr's poster back over it, and
		// the bytes already buffered stay for the next play
		expect(player.stop).toHaveBeenCalledOnce()
		expect(video.load).not.toHaveBeenCalled()
		expect(wrapper.find('video').attributes('poster')).toBe(poster.encodedSource)
	})

	it('says so, rather than throw, when it has neither a player nor a media element', () => {
		const error = vi.spyOn(logger, 'error').mockImplementation(() => {})
		let donePlaying!: () => void
		const Host = defineComponent({
			setup() {
				const file = makeFile({ basename: 'clip.mp4', mime: 'video/mp4' })
				// No template refs, so neither plyr nor the element ever arrive
				donePlaying = usePlyrPlayer(false, makeProps({ file, files: [file] }), (() => {}) as never).donePlaying
				return () => h('div')
			},
		})
		mount(Host)

		expect(() => donePlaying()).not.toThrow()
		expect(error).toHaveBeenCalledWith('Media element not found in donePlaying')
		error.mockRestore()
	})

	it('rewinds by itself when there is no player yet', async () => {
		const { wrapper, video } = await mountWithPoster()
		wrapper.findComponent({ name: 'VuePlyrStub' }).vm.player = undefined
		video.pause = vi.fn()
		video.currentTime = 12

		await wrapper.find('video').trigger('ended')

		expect(video.pause).toHaveBeenCalledOnce()
		expect(video.currentTime).toBe(0)
		expect(video.load).not.toHaveBeenCalled()
	})
})

describe('a video before it can play', () => {
	/**
	 * Mount a video, with a preview of its own unless told otherwise.
	 *
	 * @param options - The file's attributes, and the files beside it
	 * @param options.hasPreview - Whether the server has a preview of it
	 * @param options.beside - Other files in the same list
	 */
	async function mountVideo({ hasPreview = true, beside = [] as ReturnType<typeof makeFile>[] } = {}) {
		const movie = makeFile({ basename: 'clip.mp4', mime: 'video/mp4', attributes: { hasPreview } })
		const wrapper = mount(Videos, { props: makeProps({ file: movie, files: [movie, ...beside] }) })
		await flushPromises()
		return wrapper
	}

	it('shows its own preview as its poster when nothing is beside it', async () => {
		const wrapper = await mountVideo()

		expect(wrapper.find('video').attributes('poster')).toContain('/core/preview')
	})

	it('shows the picture of the same name rather than its preview', async () => {
		const picture = makeFile({ basename: 'clip.jpg', mime: 'image/jpeg' })
		const wrapper = await mountVideo({ beside: [picture] })

		expect(wrapper.find('video').attributes('poster')).toBe(picture.encodedSource)
	})

	// A slow video showed nothing but the spinner until it could play, and
	// the slideshow skipped it with its poster alone (nextcloud/viewer#39)
	it('shows the player at the size of its preview, and holds the slideshow until it can play', async () => {
		const wrapper = await mountVideo()

		expect(wrapper.emitted('loaded')).toHaveLength(1)
		expect(wrapper.emitted('update:playing')).toEqual([[true]])
		expect(wrapper.find('video').attributes('style')).toContain('width: 640px')
		expect(wrapper.find('video').attributes('style')).toContain('height: 360px')

		// Ready, but paused: a browser that refuses to autoplay does not
		// hold the slideshow for good
		await wrapper.find('video').trigger('canplay')
		expect(wrapper.emitted('update:playing')).toEqual([[true], [false]])
		expect(wrapper.emitted('loaded')).toHaveLength(1)
	})

	it('shows the player once its metadata gives its size, when it has no preview', async () => {
		const wrapper = await mountVideo({ hasPreview: false })
		expect(wrapper.emitted('loaded')).toBeUndefined()

		await wrapper.find('video').trigger('loadedmetadata')

		expect(wrapper.emitted('loaded')).toHaveLength(1)
		expect(wrapper.emitted('update:playing')).toEqual([[true]])
	})

	it('lets the slideshow go on when the video cannot be played', async () => {
		const wrapper = await mountVideo()

		// The first failure fetches the file by hand, the second gives up
		await wrapper.find('video').trigger('error')
		await flushPromises()
		await wrapper.find('video').trigger('error')
		await flushPromises()

		expect(wrapper.emitted('update:playing')).toEqual([[true], [false]])
		expect(wrapper.emitted('errored')).toHaveLength(1)
	})

	it('says it has loaded only once, however often it can play', async () => {
		const file = makeFile({ basename: 'song.mp3', mime: 'audio/mpeg' })
		const wrapper = mount(Audios, { props: makeProps({ file, files: [file] }) })
		await flushPromises()

		await wrapper.find('audio').trigger('canplay')
		await wrapper.find('audio').trigger('canplay')

		expect(wrapper.emitted('loaded')).toHaveLength(1)
	})
})

describe('media reporting that it plays', () => {
	it.each([
		['Videos', Videos, 'video', 'clip.mp4', 'video/mp4'],
		['Audios', Audios, 'audio', 'song.mp3', 'audio/mpeg'],
	])('%s tells the viewer when it plays and pauses', async (_name, component, tag, basename, mime) => {
		const file = makeFile({ basename, mime })
		const wrapper = mount(component, { props: makeProps({ file, files: [file] }) })
		await flushPromises()

		await wrapper.find(tag).trigger('play')
		expect(wrapper.emitted('update:playing')).toEqual([[true]])

		await wrapper.find(tag).trigger('pause')
		expect(wrapper.emitted('update:playing')).toEqual([[true], [false]])
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

describe('zooming into a picture', () => {
	/**
	 * Mount a picture shown from a 1000 pixel preview that fills the
	 * viewer, the way a screen-sized preview does.
	 *
	 * @param attributes - The file's dav attributes
	 */
	async function mountPreviewed(attributes: Record<string, unknown> = { hasPreview: true }) {
		const file = makeFile({ basename: 'comic.jpg', attributes })
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()
		const image = wrapper.find('img').element as HTMLImageElement
		Object.defineProperty(image, 'naturalWidth', { value: 1000, configurable: true })
		Object.defineProperty(image, 'naturalHeight', { value: 1000, configurable: true })
		await wrapper.find('img').trigger('load')
		return { wrapper, file }
	}

	/**
	 * Zoom in with the wheel, one notch at a time.
	 *
	 * @param wrapper - The mounted picture
	 * @param notches - How many notches
	 */
	async function zoomIn(wrapper: VueWrapper, notches: number) {
		for (let notch = 0; notch < notches; notch++) {
			wrapper.find('img').element.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }))
			await flushPromises()
		}
	}

	/** The width the picture is drawn at, in pixels */
	const drawnWidth = (wrapper: VueWrapper) => Number.parseInt((wrapper.find('img').element as HTMLImageElement).style.width)

	it('asks for its most detailed preview the first time it is zoomed into, and shows it', async () => {
		preloadImageMock.mockResolvedValue(4000)
		const { wrapper } = await mountPreviewed()
		expect(preloadImageMock).not.toHaveBeenCalled()

		await zoomIn(wrapper, 3)

		expect(preloadImageMock).toHaveBeenCalledOnce()
		const [url] = preloadImageMock.mock.calls[0]!
		expect(url).toContain('x=8192')
		expect(url).toContain('y=8192')
		expect(wrapper.find('img').attributes('src')).toBe(url)
	})

	it('stays the size it was drawn at when the sharper one replaces it', async () => {
		preloadImageMock.mockResolvedValue(4001)
		const { wrapper } = await mountPreviewed()
		await zoomIn(wrapper, 3)
		const drawn = (wrapper.find('img').element as HTMLImageElement).style.cssText

		// Not quite the same proportions once rounded: refitted from these,
		// the picture would come out a pixel shorter under the user's zoom
		const image = wrapper.find('img').element as HTMLImageElement
		Object.defineProperty(image, 'naturalWidth', { value: 4001, configurable: true })
		Object.defineProperty(image, 'naturalHeight', { value: 3999, configurable: true })
		await wrapper.find('img').trigger('load')

		expect(image.style.cssText).toBe(drawn)
		expect(wrapper.emitted('loaded')).toHaveLength(1)
	})

	it('zooms in until a pixel of the picture is four on screen', async () => {
		preloadImageMock.mockResolvedValue(4000)
		const { wrapper } = await mountPreviewed()

		await zoomIn(wrapper, 40)

		// 4000 pixels across shown 1000 wide: 4 times to reach them, 16 to
		// make each of them four
		expect(drawnWidth(wrapper)).toBe(16000)
	})

	it('stops at five times for a picture the preview already shows in full', async () => {
		// The server renders nothing past the original
		preloadImageMock.mockResolvedValue(1000)
		const { wrapper } = await mountPreviewed()
		const preview = wrapper.find('img').attributes('src')

		await zoomIn(wrapper, 40)

		expect(drawnWidth(wrapper)).toBe(5000)
		expect(wrapper.find('img').attributes('src')).toBe(preview)
	})

	it('keeps the picture it has when the sharper one does not come', async () => {
		preloadImageMock.mockRejectedValue(new Error('Could not load'))
		const { wrapper } = await mountPreviewed()
		const preview = wrapper.find('img').attributes('src')

		await zoomIn(wrapper, 40)

		expect(wrapper.find('img').attributes('src')).toBe(preview)
		expect(drawnWidth(wrapper)).toBe(5000)
		expect(wrapper.emitted('errored')).toBeUndefined()
	})

	it('asks with the preview header on a share that forbids downloading', async () => {
		preloadPreviewMock.mockResolvedValue('blob:detail')
		preloadImageMock.mockResolvedValue(4000)
		const { wrapper } = await mountPreviewed({
			hasPreview: true,
			'share-attributes': JSON.stringify([{ scope: 'permissions', key: 'download', value: false }]),
		})

		await zoomIn(wrapper, 1)

		const [url] = preloadPreviewMock.mock.calls.at(-1)!
		expect(url).toContain('x=8192')
		expect(preloadImageMock).toHaveBeenCalledWith('blob:detail', expect.any(AbortSignal))
		expect(wrapper.find('img').attributes('src')).toBe('blob:detail')
	})

	it('asks for nothing more when it shows the file itself', async () => {
		const { wrapper } = await mountPreviewed({})

		await zoomIn(wrapper, 3)

		expect(preloadImageMock).not.toHaveBeenCalled()
	})
})

describe('an image from a share that forbids downloading', () => {
	const restricted = () => makeFile({
		basename: 'restricted.jpg',
		attributes: {
			hasPreview: true,
			'share-attributes': JSON.stringify([{ scope: 'permissions', key: 'download', value: false }]),
		},
	})
	const message = 'No preview available, download is disabled.'

	it('says why when its preview cannot be fetched', async () => {
		preloadPreviewMock.mockRejectedValueOnce(new Error('Request failed with status code 404'))
		const file = restricted()
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()

		await wrapper.find('img').trigger('error')
		await flushPromises()

		const [[error]] = wrapper.emitted('errored') as [[Error]]
		expect(error.message).toBe(message)
	})

	it('says why when the preview it fetched does not show either', async () => {
		preloadPreviewMock.mockResolvedValueOnce('blob:preview')
		const file = restricted()
		const wrapper = mountImages({ file, files: [file] })
		await flushPromises()

		await wrapper.find('img').trigger('error')
		await flushPromises()
		await wrapper.find('img').trigger('error')
		await flushPromises()

		const [[error]] = wrapper.emitted('errored') as [[Error]]
		expect(error.message).toBe(message)
	})
})

describe('media that cannot be played', () => {
	/**
	 * Fire the element's error, the way the browser reports one.
	 *
	 * @param element - The media element
	 * @param code - The MediaError code the element reports
	 */
	async function fail(element: HTMLMediaElement, code: number) {
		Object.defineProperty(element, 'error', { value: { code }, configurable: true })
		element.dispatchEvent(new Event('error'))
		await flushPromises()
	}

	for (const [name, component, tag, mime] of [
		['a video', Videos, 'video', 'video/mp4'],
		['a sound', Audios, 'audio', 'audio/mpeg'],
	] as const) {
		describe(name, () => {
			it('shows the bytes fetched by hand once the element fails', async () => {
				preloadMediaMock.mockResolvedValueOnce('blob:fetched')
				const file = makeFile({ basename: 'media.bin', mime })
				const wrapper = mount(component, { props: makeProps({ file, files: [file] }) })
				await flushPromises()

				await fail(wrapper.find(tag).element as HTMLMediaElement, 4)

				// The fallback used to land on a source the element did not
				// bind, and the spinner stayed up for good (nextcloud/viewer#2930)
				expect(wrapper.find(tag).attributes('src')).toBe('blob:fetched')
				expect(wrapper.emitted('errored')).toBeUndefined()
			})

			it('says the browser cannot play the format when the fetched bytes fail too', async () => {
				preloadMediaMock.mockResolvedValueOnce('blob:fetched')
				const file = makeFile({ basename: 'media.bin', mime })
				const wrapper = mount(component, { props: makeProps({ file, files: [file] }) })
				await flushPromises()

				await fail(wrapper.find(tag).element as HTMLMediaElement, 4)
				await fail(wrapper.find(tag).element as HTMLMediaElement, 4)

				const [[error]] = wrapper.emitted('errored') as [[Error]]
				expect(error.message).toBe('Your browser cannot play this file format.')
			})

			it('keeps its source when playback fails after the element loaded', async () => {
				const file = makeFile({ basename: 'media.bin', mime })
				const wrapper = mount(component, { props: makeProps({ file, files: [file] }) })
				await flushPromises()
				const element = wrapper.find(tag).element as HTMLMediaElement
				const source = element.getAttribute('src')
				element.dispatchEvent(new Event('canplay'))

				// What Firefox reports with no audio device to play on
				// (MEDIA_ERR_DECODE, "OnMediaSinkAudioError")
				await fail(element, 3)

				expect(preloadMediaMock).not.toHaveBeenCalled()
				expect(wrapper.find(tag).attributes('src')).toBe(source)
				expect(wrapper.emitted('errored')).toBeUndefined()
			})

			it('keeps the plain message for any other failure', async () => {
				preloadMediaMock.mockResolvedValueOnce('blob:fetched')
				const file = makeFile({ basename: 'media.bin', mime })
				const wrapper = mount(component, { props: makeProps({ file, files: [file] }) })
				await flushPromises()

				await fail(wrapper.find(tag).element as HTMLMediaElement, 4)
				// MEDIA_ERR_NETWORK
				await fail(wrapper.find(tag).element as HTMLMediaElement, 2)

				const [[error]] = wrapper.emitted('errored') as [[Error]]
				expect(error.message).toBe('Failed to load media.')
			})
		})
	}
})
