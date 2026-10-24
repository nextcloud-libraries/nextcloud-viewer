<!--
  - SPDX-FileCopyrightText: 2019 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<!-- eslint-disable vue/no-unused-refs -- the player ref is consumed by useVideojsAdapter, the video one by useMediaPlayer, via useTemplateRef -->
	<media-i18n :lang="playerLanguage">
		<video-player ref="player" :poster="poster">
			<video-skin
				class="viewer-media"
				tabindex="-1"
				:style="{
					height: height + 'px',
					width: width + 'px',
				}">
				<video
					ref="video"
					:autoplay="!embedded"
					:playsinline="true"
					:poster="poster"
					:src="src"
					preload="metadata"
					@error.capture.prevent.stop="onFail"
					@ended="donePlaying"
					@pause="onPause"
					@play="onPlay"
					@canplay="doneLoading"
					@loadedmetadata="onLoadedMetadata">

					<!-- Omitting `type` on purpose because most of the
						browsers auto detect the appropriate codec.
						Having it set force the browser to comply to
						the provided mime instead of detecting a potential
						compatibility. -->

					{{ t('Your browser does not support videos.') }}
				</video>
				<!-- The skin shows its poster only until playback starts, and
					the viewer rewinds a played video to it (nextcloud/viewer#2585) -->
				<img
					v-if="stopped && poster"
					class="viewer-media__poster"
					alt=""
					:src="poster">
				<!-- The sound plays on: only the picture is lost -->
				<p v-if="pictureMissing" class="viewer-media__no-picture" role="status">
					<VideoOffOutlineIcon :size="18" />
					{{ t('Your browser can\'t show this video\'s picture, only its sound') }}
				</p>
			</video-skin>
		</video-player>
	</media-i18n>
</template>

<script setup lang="ts">
import type { ViewerEmits, ViewerProps } from '../viewer.ts'

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import VideoOffOutlineIcon from 'vue-material-design-icons/VideoOffOutline.vue'
import { useMediaPlayer } from '../composables/useMediaPlayer.ts'
import { useVideojsAdapter } from '../composables/useVideojsAdapter.ts'
import { logger } from '../services/logger.ts'
import { preloadImageSize } from '../services/mediaPreloader.ts'
import { canDownload } from '../utils/canDownload.ts'
import { probeFile } from '../utils/isoMedia.ts'
import { t } from '../utils/l10n.ts'
import { findLivePhotoPeerFromFileId, findLivePhotoPeerFromName } from '../utils/livePhotoUtils.ts'
import { playerLanguage } from '../utils/playerTranslations.ts'
import { getPreviewIfAny, getServerPreview } from '../utils/previewUtils.ts'

import '@videojs/html/video/player'
import '@videojs/html/video/skin'

defineOptions({
	name: 'ViewerVideos',
})

const props = defineProps<ViewerProps>()
const emit = defineEmits<ViewerEmits>()

const { stopped, ...adapter } = useVideojsAdapter()
const {
	video,
	onFail,
	donePlaying,
	doneLoading,
	onPause,
	onPlay,
	showBeforePlayable,
	src,
} = useMediaPlayer(false, props, emit, adapter)

const height = ref(0)
const width = ref(0)

// Update video size when max height or width props change
watch(() => props.maxHeight, updateVideoSize)
watch(() => props.maxWidth, updateVideoSize)

const metadataFilesLivePhoto = computed(() => props.file.attributes?.['metadata-files-live-photo'] as number | undefined)

const livePhotoPath = computed(() => {
	// The dav metadata links the halves of a live photo by file id. A video
	// without it keeps the picture of the same name beside it as its poster,
	// the way cameras save them.
	const peerFile = metadataFilesLivePhoto.value !== undefined
		? findLivePhotoPeerFromFileId(metadataFilesLivePhoto.value, props.files)
		: findLivePhotoPeerFromName(props.file, props.files)
	if (peerFile === undefined) {
		return undefined
	}
	return getPreviewIfAny(peerFile, { width: props.maxWidth, height: props.maxHeight })
})

// The server's preview of the video, taken at the size it opened in so a
// resize does not fetch it again, and the video's size before it has its
// metadata: that of its preview, or the one read from its header
const videoPreview = ref<string>()
const knownSize = ref<{ width: number, height: number }>()
let previewLoad: AbortController | undefined
// The width the browser decoded the picture at, once it has the metadata
const decodedWidth = ref<number>()

/**
 * Whether the video has a picture the browser cannot decode, HEVC in many
 * of them: its metadata loads with no size, and the sound plays over black,
 * without an error. Only for a video known to have a picture, from its
 * preview or its header, as a file with only sound is no size too.
 */
const pictureMissing = computed(() => decodedWidth.value === 0 && knownSize.value !== undefined)

// The picture of the same name beside the video when there is one: it is
// what people put there to be shown. The video's own preview otherwise.
const poster = computed(() => livePhotoPath.value ?? videoPreview.value)

watch(() => props.file.source, (source) => {
	previewLoad?.abort()
	knownSize.value = undefined
	decodedWidth.value = undefined
	if (!canDownload(props.file) || props.file.attributes?.['e2ee-is-encrypted']) {
		videoPreview.value = undefined
		return
	}
	videoPreview.value = getServerPreview(props.file, { width: props.maxWidth, height: props.maxHeight })

	// Size the player from what was found, if the file shown is still this one
	const sizeFrom = (size?: { width: number, height: number }) => {
		if (size === undefined || source !== props.file.source) {
			return
		}
		knownSize.value = size
		updateVideoSize()
		showBeforePlayable()
	}

	if (videoPreview.value === undefined) {
		// Nothing lost if this finds nothing: the metadata sizes the player
		probeFile(props.file).then((probe) => sizeFrom(probe?.size))
		return
	}
	previewLoad = new AbortController()
	preloadImageSize(videoPreview.value, previewLoad.signal).then(sizeFrom).catch(() => {
		// Nothing lost: the metadata sizes the player instead
	})
}, { immediate: true })

onBeforeUnmount(() => previewLoad?.abort())

/**
 * Update the video size based on the max height and width props
 * We need to keep the aspect ratio of the video
 * and fit it within the max height and width.
 */
function updateVideoSize() {
	// The video itself once it has its metadata, what was known of it until
	// then: its header's size, or its preview's, which keeps its proportions
	// and is no larger than the video or than the space asked for
	const videoHeight = video?.value?.videoHeight || knownSize.value?.height
	const videoWidth = video?.value?.videoWidth || knownSize.value?.width
	if (!videoHeight || !videoWidth) {
		return
	}

	const heightRatio = props.maxHeight / videoHeight
	const widthRatio = props.maxWidth / videoWidth

	// Shrunk to fit, never blown up past its own size: a small clip stays
	// sharp at the size it was made at
	const ratio = Math.min(1, heightRatio, widthRatio)
	height.value = Math.floor(videoHeight * ratio)
	width.value = Math.floor(videoWidth * ratio)
}

/**
 * Update video size when metadata is loaded
 */
function onLoadedMetadata() {
	logger.debug('Video metadata loaded, updating size', { filename: props.file.basename })
	decodedWidth.value = video.value?.videoWidth ?? 0
	updateVideoSize()
	showBeforePlayable()
}
</script>

<style scoped lang="scss">
.viewer-media {
	// The skin's public settings: the rest of its look is its own
	--media-accent-color: var(--color-primary-element);
	--media-accent-text-color: var(--color-primary-element-text);
	--media-border-radius: 0;
	--media-font-family: var(--font-face);

	position: relative;
	display: block;
	/* over arrows in tiny screens */
	z-index: 20050;
	align-self: center;
	justify-self: center;
	max-width: 100%;
	max-height: 100%;
	background-color: black;
}

.viewer-media__no-picture {
	position: absolute;
	top: calc(2 * var(--default-grid-baseline));
	inset-inline-start: 50%;
	transform: translateX(-50%);
	display: flex;
	align-items: center;
	gap: var(--default-grid-baseline);
	max-width: calc(100% - 4 * var(--default-grid-baseline));
	margin: 0;
	padding: var(--default-grid-baseline) calc(3 * var(--default-grid-baseline));
	border: 1px solid rgba(255, 255, 255, .25);
	border-radius: var(--border-radius-pill);
	background-color: rgba(0, 0, 0, .75);
	color: white;
	pointer-events: none;
}

[dir="rtl"] .viewer-media__no-picture {
	transform: translateX(50%);
}

.viewer-media__poster {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: contain;
	pointer-events: none;
}
</style>

<style lang="scss">
// Fullscreen styles to hide header and footer
// when in fullscreen mode
main.viewer__hidden-fullscreen {
	height: 100vh !important;
	width: 100vw !important;
	margin: 0 !important;
}

footer.viewer__hidden-fullscreen {
	display: none !important;
}
</style>
