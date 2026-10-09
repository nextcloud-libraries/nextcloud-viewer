<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<figure class="image-differences" :style="{ width: `${box.width}px`, height: `${box.height}px` }">
		<img
			class="image-differences__image"
			:alt="base.displayname"
			:src="baseSource"
			@load="onLoad"
			@error="onError">
		<!-- The other one over it, cut where the slider is -->
		<img
			class="image-differences__image"
			:alt="other.displayname"
			:src="otherSource"
			:style="{ clipPath: `inset(0 0 0 ${position}%)` }"
			@load="onLoad"
			@error="onError">

		<span class="image-differences__label image-differences__label--base">{{ base.displayname }}</span>
		<span class="image-differences__label image-differences__label--other">{{ other.displayname }}</span>

		<input
			v-model.number="position"
			class="image-differences__slider"
			type="range"
			min="0"
			max="100"
			:aria-label="t('Slide to compare {base} with {other}', { base: base.displayname, other: other.displayname })">
		<span class="image-differences__divider" :style="{ insetInlineStart: `${position}%` }" />
	</figure>
</template>

<script setup lang="ts">
import type { IFile } from '@nextcloud/files'
import type { ViewerEmits } from '../viewer.ts'

import { computed, onMounted, ref } from 'vue'
import { t } from '../utils/l10n.ts'
import { getPreviewIfAny } from '../utils/previewUtils.ts'

const props = defineProps<{
	/** The two files compared, the older one first */
	files: IFile[]
	/** The width to show them in */
	maxWidth: number
	/** The height to show them in */
	maxHeight: number
}>()

const emit = defineEmits<ViewerEmits>()

const base = computed(() => props.files[0]!)
const other = computed(() => props.files[1]!)
// Both at the same size, so they line up
const space = computed(() => ({ width: props.maxWidth, height: props.maxHeight }))
const baseSource = computed(() => getPreviewIfAny(base.value, space.value))
const otherSource = computed(() => getPreviewIfAny(other.value, space.value))

// The size of the pictures, once one has loaded: the slider, the divider and
// the labels belong on the picture, not on the space around it
const natural = ref<{ width: number, height: number }>()
const box = computed(() => {
	if (natural.value === undefined) {
		return { width: props.maxWidth, height: props.maxHeight }
	}
	const { width, height } = natural.value
	const scale = Math.min(1, props.maxWidth / width, props.maxHeight / height)
	return { width: Math.round(width * scale), height: Math.round(height * scale) }
})

// Where the slider is, in percent from the start: the base shows before it,
// the other file after it
const position = ref(50)

// Dragging the slider would otherwise be taken for a swipe
onMounted(() => emit('update:canSwipe', false))

let loadedImages = 0
let failed = false

/**
 * One of the two images loaded: done once both have.
 *
 * @param event - The image's load
 */
function onLoad(event: Event) {
	const { naturalWidth, naturalHeight } = event.target as HTMLImageElement
	if (natural.value === undefined && naturalWidth > 0 && naturalHeight > 0) {
		natural.value = { width: naturalWidth, height: naturalHeight }
	}
	loadedImages++
	if (loadedImages === 2) {
		emit('loaded')
	}
}

/**
 * An image that cannot be shown leaves nothing to compare.
 */
function onError() {
	if (!failed) {
		failed = true
		emit('errored', new Error(t('Failed to load image.')))
	}
}
</script>

<style scoped lang="scss">
.image-differences {
	position: relative;
	margin: 0;
	max-width: 100%;
	max-height: 100%;

	&__image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		// The slider takes the pointer, not the pictures
		pointer-events: none;
		user-select: none;
	}

	&__label {
		position: absolute;
		top: calc(2 * var(--default-grid-baseline));
		padding: var(--default-grid-baseline) calc(2 * var(--default-grid-baseline));
		border-radius: var(--border-radius-small);
		background-color: rgba(0, 0, 0, .6);
		color: #ffffff;
		font-size: var(--font-size-small, 13px);
		pointer-events: none;

		&--base {
			inset-inline-start: calc(2 * var(--default-grid-baseline));
		}

		&--other {
			inset-inline-end: calc(2 * var(--default-grid-baseline));
		}
	}

	&__divider {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		margin-inline-start: -1px;
		background-color: #ffffff;
		box-shadow: 0 0 4px rgba(0, 0, 0, .6);
		pointer-events: none;
	}

	// Over the whole picture, so it can be dragged from anywhere, but unseen:
	// the divider is what shows where it is
	&__slider {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: ew-resize;

		&:focus-visible + .image-differences__divider {
			width: 4px;
			margin-inline-start: -2px;
			outline: 2px solid var(--color-primary-element);
		}
	}
}
</style>
