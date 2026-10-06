<!--
  - SPDX-FileCopyrightText: 2019 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<!-- eslint-disable vue/no-unused-refs -- the plyr ref is consumed by usePlyrAdapter, the media one by useMediaPlayer, via useTemplateRef -->
	<!-- Plyr currently replaces the parent. Wrapping to prevent this
	https://github.com/redxtech/vue-plyr/issues/259 -->
	<div>
		<VuePlyr
			ref="plyr"
			:options="options"
			:style="{
				height: height + 'px',
				width: width + 'px',
			}">
			<video
				ref="video"
				:autoplay="true"
				:playsinline="true"
				:poster="poster"
				:src="src"
				:style="{
					height: height + 'px',
					width: width + 'px',
				}"
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
		</VuePlyr>
	</div>
</template>

<script setup lang="ts">
import type { ViewerEmits, ViewerProps } from '../viewer.ts'

import VuePlyr from '@skjnldsv/vue-plyr'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMediaPlayer } from '../composables/useMediaPlayer.ts'
import { usePlyrAdapter } from '../composables/usePlyrAdapter.ts'
import { logger } from '../services/logger.ts'
import { preloadImageSize } from '../services/mediaPreloader.ts'
import { canDownload } from '../utils/canDownload.ts'
import { probeFile } from '../utils/isoMedia.ts'
import { t } from '../utils/l10n.ts'
import { findLivePhotoPeerFromName } from '../utils/livePhotoUtils.ts'
import { getPreviewIfAny, getServerPreview } from '../utils/previewUtils.ts'

defineOptions({
	name: 'ViewerVideos',
})

const props = defineProps<ViewerProps>()
const emit = defineEmits<ViewerEmits>()

const { options, ...player } = usePlyrAdapter(false)
const {
	video,
	onFail,
	donePlaying,
	doneLoading,
	onPause,
	onPlay,
	showBeforePlayable,
	src,
} = useMediaPlayer(false, props, emit, player)

const height = ref(0)
const width = ref(0)

// Update video size when max height or width props change
watch(() => props.maxHeight, updateVideoSize)
watch(() => props.maxWidth, updateVideoSize)

const livePhotoPath = computed(() => {
	const peerFile = findLivePhotoPeerFromName(props.file, props.files)
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

// The picture of the same name beside the video when there is one: it is
// what people put there to be shown. The video's own preview otherwise.
const poster = computed(() => livePhotoPath.value ?? videoPreview.value)

watch(() => props.file.source, (source) => {
	previewLoad?.abort()
	knownSize.value = undefined
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
	updateVideoSize()
	showBeforePlayable()
}
</script>

<style scoped lang="scss">
video {
	/* over arrows in tiny screens */
	z-index: 20050;
	align-self: center;
	max-width: 100%;
	max-height: 100% !important;
	background-color: black;

	justify-self: center;
}

:deep() {
	.plyr:-webkit-full-screen video {
		width: 100% !important;
		height: 100% !important;
	}
	.plyr:fullscreen video {
		width: 100% !important;
		height: 100% !important;
	}
	.plyr__progress__container {
		flex: 1 1;
	}

	.plyr {
		// stylelint-disable-next-line no-invalid-position-at-import-rule -- scoped scss partial
		@import '../mixins/Plyr.scss';

		// Override server font style
		button {
			color: white;

			&:hover,
			&:focus {
				color: var(--color-primary-element-text);
				background-color: var(--color-primary-element);
			}
		}
	}
}
</style>

<style lang="scss">
@import '@skjnldsv/vue-plyr/dist/vue-plyr.css';

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
