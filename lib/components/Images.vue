<!--
  - SPDX-FileCopyrightText: 2019 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<div class="image_container">
		<template v-if="data !== null">
			<img
				v-if="!livePhotoCanBePlayed"
				ref="image"
				:alt="alt"
				:class="{
					dragging,
					loaded,
					zoomed: zoomRatio > 1,
				}"
				:src="data"
				:style="imgStyle"
				@error.capture.prevent.stop="onFail"
				@load="onDoneLoading"
				@wheel.stop.prevent="updateZoom"
				@dblclick.prevent="onDblclick"
				@pointerdown.prevent="pointerDown"
				@pointerup.prevent="pointerUp"
				@pointermove.prevent="pointerMove">

			<template v-if="livePhoto">
				<video
					v-show="livePhotoCanBePlayed"
					ref="video"
					:class="{
						dragging,
						loaded,
						zoomed: zoomRatio > 1,
					}"
					:style="imgStyle"
					:playsinline="true"
					muted
					:poster="data ?? undefined"
					:src="livePhotoSrc ?? undefined"
					preload="metadata"
					@canplaythrough="doneLoadingLivePhoto"
					@loadedmetadata="updateImageSize"
					@wheel.stop.prevent="updateZoom"
					@error.capture.prevent.stop.once="onFail"
					@dblclick.prevent="onDblclick"
					@pointerdown.prevent="pointerDown"
					@pointerup.prevent="pointerUp"
					@pointermove.prevent="pointerMove"
					@ended="stopLivePhoto" />
				<button
					v-if="width !== 0"
					class="live-photo_play_button"
					:style="{ left: `calc(50% - ${width / 2}px)` }"
					:disabled="!livePhotoCanBePlayed"
					:aria-label="t('Play the live photo')"
					@click="playLivePhoto"
					@pointerenter="playLivePhoto"
					@focus="playLivePhoto"
					@pointerleave="stopLivePhoto"
					@blur="stopLivePhoto">
					<PlayCircleOutline v-if="livePhotoCanBePlayed" />
					<NcLoadingIcon v-else />
					<!-- TRANSLATORS Label of the button used at the top left corner of live photos to play them -->
					{{ t('LIVE') }}
				</button>
			</template>
		</template>
	</div>
</template>

<script setup lang="ts">
import type { ViewerEmits, ViewerProps } from '../viewer.ts'

import axios from '@nextcloud/axios'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import PlayCircleOutline from 'vue-material-design-icons/PlayCircleOutline.vue'
import { useViewerProps } from '../composables/useViewerProps.ts'
import { logger } from '../services/logger.ts'
import { preloadMedia } from '../services/mediaPreloader.ts'
import { t } from '../utils/l10n.ts'
import { findLivePhotoPeerFromFileId } from '../utils/livePhotoUtils.ts'
import { getPreviewIfAny } from '../utils/previewUtils.ts'

defineOptions({
	name: 'ViewerImages',
})

const props = withDefaults(defineProps<ViewerProps>(), {
	editing: false,
})

const emit = defineEmits<ViewerEmits>()

// Use the viewer props composable
const { filename, src } = useViewerProps(props)

// Refs
const image = ref<HTMLImageElement>()
const video = ref<HTMLVideoElement>()

// Reactive state
const dragging = ref(false)
const dragX = ref(0)
const dragY = ref(0)
const pinchDistance = ref(0)
const pinchStartZoomRatio = ref(1)
const pointerCache = ref<Array<{ pointerId: number, x: number, y: number }>>([])
const shiftX = ref(0)
const shiftY = ref(0)
const zooming = ref(false)
const zoomRatio = ref(1)

const data = ref<string | null>(null)
const fallback = ref(false)
const livePhotoCanBePlayed = ref(false)
const loaded = ref(false)

const height = ref(0)
const width = ref(0)

// Computed properties
const mime = computed(() => props.file.mime)

const hasPreview = computed(() => props.file.attributes?.hasPreview ?? false)
const previewUrl = computed(() => props.file.attributes?.previewUrl)
const metadataFilesLivePhoto = computed(() => props.file.attributes?.['metadata-files-live-photo'])
// Asked for the space it will be shown in, rather than for the whole display
const previewPath = computed(() => getPreviewIfAny(props.file, { width: props.maxWidth, height: props.maxHeight }))

const zoomHeight = computed(() => Math.round(height.value * zoomRatio.value))
const zoomWidth = computed(() => Math.round(width.value * zoomRatio.value))
const alt = computed(() => props.file.displayname)

const imgStyle = computed(() => {
	if (zoomRatio.value === 1) {
		return {
			height: zoomHeight.value + 'px',
			width: zoomWidth.value + 'px',
		}
	}
	return {
		marginTop: Math.round(shiftY.value * 2) + 'px',
		marginLeft: Math.round(shiftX.value * 2) + 'px',
		height: zoomHeight.value + 'px',
		width: zoomWidth.value + 'px',
	}
})

const livePhoto = computed(() => {
	if (metadataFilesLivePhoto.value === undefined) {
		return undefined
	}
	return findLivePhotoPeerFromFileId(metadataFilesLivePhoto.value, props.files)
})

// Encoded, as it goes straight into the video element's `src`
const livePhotoSrc = computed(() => livePhoto.value?.encodedSource ?? null)

/**
 * What is fetching the current file, so it can be dropped when the viewer
 * moves on. Paging quickly through a folder otherwise leaves a trail of
 * requests for files nobody is looking at any more.
 */
let inFlight: { controller: AbortController, source: string } | null = null

// Load data when component mounts or file changes. Keyed on the source, as
// two files can be shown under one name and it is the source that says
// which bytes to fetch.
watch(() => props.file.source, async () => {
	await loadData()
})
watch(data, () => {
	loaded.value = false
	catchUpIfLoaded()
})
// Prefer a client-side source (e.g. a freshly edited image) over any fetch.
watch(() => props.localSource, (source) => {
	if (source) {
		data.value = source
	}
})
loadData()

/**
 * Load the image data to be displayed
 */
async function loadData() {
	// Only a different file supersedes what is loading: reloading the same
	// one (a retry, a resize) must not cancel the request already serving it
	if (inFlight !== null && inFlight.source !== props.file.source) {
		inFlight.controller.abort()
	}
	const controller = new AbortController()
	inFlight = { controller, source: props.file.source }
	const { signal } = controller
	// A client-side source (e.g. a just-edited image) is shown as-is, no fetch.
	if (props.localSource) {
		data.value = props.localSource
		return
	}

	// Avoid svg xss attack vector. Above the fallback below on purpose: an
	// svg is only ever shown through the sanitizer, never as raw bytes.
	if (mime.value === 'image/svg+xml') {
		data.value = await getBase64FromImage(signal)
		return
	}

	// A failed load means the URL the browser was given is not one it can
	// use: an E2EE file, or a preview the server cannot produce. Fetch the
	// bytes by hand and show those instead.
	if (fallback.value) {
		data.value = await preloadMedia(props.file, signal)
		return
	}

	// Load the raw gif instead of the static preview
	if (mime.value === 'image/gif') {
		data.value = src.value
		return
	}

	// If there is no preview and we have a direct source, load it instead
	if (props.file.source && !hasPreview.value && !previewUrl.value) {
		data.value = src.value
		return
	}

	data.value = previewPath.value
}

/**
 * Report an image that finished loading before its load handler existed.
 *
 * A source the browser already has — the same preview at a new size, a
 * file being reopened — can complete between the src being set and Vue
 * binding `@load`, and that event is then never heard. The viewer is
 * waiting on it to stop showing its spinner, so it would wait forever.
 */
async function catchUpIfLoaded() {
	await nextTick()
	const element = image.value
	if (element?.complete && element.naturalWidth > 0 && !loaded.value) {
		onDoneLoading()
	}
}

/**
 * The image/video has finished loading
 */
function onDoneLoading() {
	loaded.value = true
	updateImageSize()
}

// The viewer hears 'loaded' as a DOM event on the custom element, and an
// event dispatched from inside the img's own load handler can land while
// Vue is still patching that element — the listener is attached, but not
// yet when the event goes out, and the viewer waits for a load that has
// already happened. Announcing it after the patch instead.
watch(loaded, (isLoaded) => {
	if (isLoaded) {
		emit('loaded')
	}
}, { flush: 'post' })

/**
 * Fit the media element to the available space while keeping its aspect ratio.
 * The intrinsic dimensions come from the loaded element itself — the image's
 * `naturalWidth`/`naturalHeight`, or the live-photo video's `videoWidth`/
 * `videoHeight` — which is the reliable source once `load`/`loadedmetadata`
 * has fired.
 */
function updateImageSize() {
	const mediaWidth = image.value?.naturalWidth || video.value?.videoWidth
	const mediaHeight = image.value?.naturalHeight || video.value?.videoHeight
	if (!mediaWidth || !mediaHeight) {
		return
	}

	const ratio = Math.min(props.maxHeight / mediaHeight, props.maxWidth / mediaWidth)
	width.value = Math.floor(mediaWidth * ratio)
	height.value = Math.floor(mediaHeight * ratio)
}

// Refit on container resize (max height/width change) using the element's
// already-known intrinsic size. A new file refits through its load event.
watch([() => props.maxWidth, () => props.maxHeight], updateImageSize)

onUnmounted(() => {
	inFlight?.controller.abort()
})

/**
 * @param signal aborts the request when the viewer moves to another file
 * @return base64 string of the image
 */
async function getBase64FromImage(signal?: AbortSignal): Promise<string> {
	const file = await axios.get(src.value, { signal })
	// Loaded here rather than with the component: the sanitizer is for svg
	// alone, and an svg is a small share of the images anyone opens.
	const { default: DOMPurify } = await import('dompurify')
	const sanitized = DOMPurify.sanitize(file.data)
	return `data:${mime.value};base64,${btoa(unescape(encodeURIComponent(sanitized)))}`
}

/**
 * @param newShiftX - The desired horizontal shift in pixels (clamped to the zoomed bounds)
 * @param newShiftY - The desired vertical shift in pixels (clamped to the zoomed bounds)
 * @param newZoomRatio - The zoom ratio used to compute the maximum allowed shift
 */
function updateShift(newShiftX: number, newShiftY: number, newZoomRatio: number) {
	const maxShiftX = width.value * newZoomRatio - width.value
	const maxShiftY = height.value * newZoomRatio - height.value
	shiftX.value = Math.min(Math.max(newShiftX, -maxShiftX / 2), maxShiftX / 2)
	shiftY.value = Math.min(Math.max(newShiftY, -maxShiftY / 2), maxShiftY / 2)
}

/**
 * @param stableX - The horizontal viewport coordinate to keep stable while zooming
 * @param stableY - The vertical viewport coordinate to keep stable while zooming
 * @param newZoomRatio - The new zoom ratio to apply
 */
function updateZoomAndShift(stableX: number, stableY: number, newZoomRatio: number) {
	// scrolling position relative to the image
	const element = image.value ?? video.value
	if (!element) {
		return
	}

	const scrollX = stableX - element.getBoundingClientRect().x - (width.value * zoomRatio.value / 2)
	const scrollY = stableY - element.getBoundingClientRect().y - (height.value * zoomRatio.value / 2)
	const scrollPercX = scrollX / (width.value * zoomRatio.value)
	const scrollPercY = scrollY / (height.value * zoomRatio.value)

	// calc how much the img grow from its current size and adjust the margin accordingly
	const growX = width.value * newZoomRatio - width.value * zoomRatio.value
	const growY = height.value * newZoomRatio - height.value * zoomRatio.value

	// compensate for existing margins
	const newShiftX = shiftX.value - scrollPercX * growX
	const newShiftY = shiftY.value - scrollPercY * growY
	updateShift(newShiftX, newShiftY, newZoomRatio)
	zoomRatio.value = newZoomRatio
}

/**
 * How far apart the two cached pointers are, which is what a pinch is
 * measured against. Zero unless there are two of them.
 */
function distanceBetweenTouches(): number {
	const t0 = pointerCache.value[0]
	const t1 = pointerCache.value[1]
	if (!t0 || !t1) {
		return 0
	}
	const diffX = t1.x - t0.x
	const diffY = t1.y - t0.y
	return Math.sqrt(diffX * diffX + diffY * diffY)
}

/**
 * @param event - The wheel event driving the zoom in/out
 */
function updateZoom(event: WheelEvent) {
	const isZoomIn = event.deltaY < 0
	const newZoomRatio = isZoomIn
		? Math.min(zoomRatio.value * 1.1, 5) // prevent too big zoom
		: Math.max(zoomRatio.value / 1.1, 1) // prevent too small zoom

	// do not continue, img is back to its original state
	if (newZoomRatio === 1) {
		return resetZoom()
	}

	emit('update:canSwipe', false)
	updateZoomAndShift(event.clientX, event.clientY, newZoomRatio)
}

/**
 * Reset zoom to original state
 */
function resetZoom() {
	emit('update:canSwipe', true)
	zoomRatio.value = 1
	shiftX.value = 0
	shiftY.value = 0
}

/**
 * Used for pinch zoom and drag
 *
 * @param event The pointer down event
 */
function pointerDown(event: PointerEvent) {
	// New pointer - mouse down or additional touch --> store client coordinates in the pointer cache
	pointerCache.value.push({ pointerId: event.pointerId, x: event.clientX, y: event.clientY })

	// Single touch or mouse down --> start dragging
	if (pointerCache.value.length === 1) {
		dragX.value = event.clientX
		dragY.value = event.clientY
		dragging.value = true
	}

	// Two touches --> start (pinch) zooming
	if (pointerCache.value.length === 2) {
		// Calculate base (reference) distance between touches
		pinchDistance.value = distanceBetweenTouches()
		pinchStartZoomRatio.value = zoomRatio.value
		zooming.value = true
		emit('update:canSwipe', false)
	}
}

/**
 * Used for pinch zoom and drag
 *
 * @param event The pointer up event
 */
function pointerUp(event: PointerEvent) {
	// Remove pointer from the pointer cache
	const index = pointerCache.value.findIndex((cachedEv) => cachedEv.pointerId === event.pointerId)
	pointerCache.value.splice(index, 1)
	dragging.value = false
	zooming.value = false
}

/**
 * Used for pinch zoom and drag
 *
 * @param event The pointer move event
 */
function pointerMove(event: PointerEvent) {
	if (pointerCache.value.length > 0) {
		// Update pointer position in the pointer cache
		const index = pointerCache.value.findIndex((cachedEv) => cachedEv.pointerId === event.pointerId)
		const cached = index >= 0 ? pointerCache.value[index] : undefined
		if (cached) {
			cached.x = event.clientX
			cached.y = event.clientY
		}
	}

	// Single touch or mouse down --> dragging
	if (pointerCache.value.length === 1 && dragging.value && !zooming.value && zoomRatio.value > 1) {
		const { clientX, clientY } = event
		const newShiftX = shiftX.value + (clientX - dragX.value)
		const newShiftY = shiftY.value + (clientY - dragY.value)

		updateShift(newShiftX, newShiftY, zoomRatio.value)

		dragX.value = clientX
		dragY.value = clientY
	}

	// Two touches --> (pinch) zooming
	if (pointerCache.value.length === 2 && zooming.value) {
		// Calculate current distance between touches
		const newDistance = distanceBetweenTouches()

		// Calculate new zoom ratio - keep it between 1 and 5
		const newZoomRatio = Math.min(Math.max(pinchStartZoomRatio.value * (newDistance / pinchDistance.value), 1), 5)

		// Calculate "stable" point - in the middle between touches
		const t0 = pointerCache.value[0]
		const t1 = pointerCache.value[1]
		if (!t0 || !t1) {
			return
		}
		const stableX = (t0.x + t1.x) / 2
		const stableY = (t0.y + t1.y) / 2

		updateZoomAndShift(stableX, stableY, newZoomRatio)
	}
}

/**
 * Start zooming in or reset zoom on double click
 */
function onDblclick() {
	if (zoomRatio.value > 1) {
		resetZoom()
	} else {
		zoomRatio.value = 1.3
	}
}

/**
 * The element could not load what it was given: fetch the file by hand
 * once, and report the failure if that does not work either.
 */
async function onFail() {
	if (fallback.value) {
		logger.error(`Loading of file ${filename.value} failed even after fallback`)
		emit('errored', new Error(t('Failed to load image.')))
		return
	}

	// Try to load E2EE file as a fallback. Reloading is what puts the
	// fallback on screen: the element shows `data`, so handing the fetched
	// bytes to anything else leaves it on the source that just failed.
	logger.error(`Loading of file ${filename.value} failed, falling back to fetching it by hand`)
	fallback.value = true
	try {
		await loadData()
	} catch (error) {
		logger.error(`Fallback fetch of ${filename.value} failed`, { error })
		emit('errored', new Error(t('Failed to load image.')))
	}
}

/**
 * The live photo has finished loading
 */
function doneLoadingLivePhoto() {
	livePhotoCanBePlayed.value = true
	onDoneLoading()
}

/**
 * If possible, play the live photo
 */
function playLivePhoto() {
	if (!livePhotoCanBePlayed.value || !video.value) {
		return
	}
	// Hovering is not a user gesture, so a browser is entitled to refuse.
	// Nothing to do about that beyond not leaving a rejection behind.
	video.value.play().catch((error) => {
		logger.debug('The browser refused to play the live photo', { error })
	})
}

/**
 * Stop the live photo playback if any
 */
function stopLivePhoto() {
	if (!video.value) {
		return
	}
	video.value.load()
}
</script>

<style scoped lang="scss">
$checkered-size: 8px;
$checkered-color: #efefef;

.image_container {
	display: flex;
	align-items: center;
	height: 100%;
	justify-content: center;
}

img, video {
	align-self: center;
	justify-self: center;
	// black while loading
	background-color: #000;
	// disable animations during zooming/resize
	transition: none !important;
	touch-action: none;
	// show checkered bg on hover if not currently zooming (but ok if zoomed)
	&:hover {
		background-image: linear-gradient(45deg, #{$checkered-color} 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #{$checkered-color} 75%),
			linear-gradient(45deg, transparent 75%, #{$checkered-color} 75%),
			linear-gradient(45deg, #{$checkered-color} 25%, #fff 25%);
		background-size: #{2 * $checkered-size} #{2 * $checkered-size};
		background-position: 0 0, 0 0, -#{$checkered-size} -#{$checkered-size}, $checkered-size $checkered-size;
	}
	&.loaded {
		// white once done loading
		background-color: #fff;
	}
	&.zoomed {
		z-index: 10010;
		cursor: move;
	}

	&.dragging {
		transition: none !important;
		cursor: move;
	}
}

.live-photo_play_button {
	position: absolute;
	top: 0;
	// left: is set dynamically on the element itself
	margin: 16px !important;
	display: flex;
	align-items: center;
	border: none;
	gap: 4px;
	border-radius: var(--border-radius);
	padding: 4px 8px;
	background-color: var(--color-main-background-blur);
}
</style>
