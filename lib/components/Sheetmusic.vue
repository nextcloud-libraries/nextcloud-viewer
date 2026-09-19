<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<div class="sheetmusic" :style="frame">
		<div ref="sheet" class="sheetmusic__sheet" />
	</div>
</template>

<script setup lang="ts">
import type { ViewerEmits, ViewerProps } from '../viewer.ts'

import axios from '@nextcloud/axios'
import { computed, onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { logger } from '../services/logger.ts'
import { t } from '../utils/l10n.ts'

defineOptions({
	name: 'ViewerSheetmusic',
})

const props = defineProps<ViewerProps>()
const emit = defineEmits<ViewerEmits>()

const sheet = useTemplateRef<HTMLDivElement>('sheet')

/**
 * The space to draw in.
 *
 * A handler is mounted as a custom element, which is inline until it is
 * told otherwise, so a sheet sized against its parent would be drawn into
 * a box a few pixels wide. The viewer passes the room it has; use that.
 */
const frame = computed(() => ({
	width: `${props.maxWidth}px`,
	height: `${props.maxHeight}px`,
}))

/** The renderer, once the chunk carrying it has arrived */
let display: { render: () => void, clear: () => void } | null = null

/** What is fetching the current file, so it can be dropped on a move */
let controller: AbortController | null = null

/**
 * Wait until an element has been given a width, and answer with it.
 *
 * Zero is answered too, after a few frames: a score drawn into nothing is
 * a poor result but a better one than a viewer that never stops waiting.
 *
 * @param element the element to measure
 */
async function widthOf(element: HTMLElement): Promise<number> {
	for (let frame = 0; frame < 30; frame++) {
		if (element.offsetWidth > 0) {
			return element.offsetWidth
		}
		await new Promise((resolve) => requestAnimationFrame(resolve))
	}
	return element.offsetWidth
}

/**
 * Draw the file on screen.
 *
 * The renderer is imported here rather than at the top of the module
 * because it is two megabytes: pulled in with the rest of the viewer it
 * would be downloaded by everyone who ever opens a photo. Behind this
 * await it is a chunk of its own, fetched the first time somebody opens
 * a piece of sheet music and never otherwise.
 */
async function draw(): Promise<void> {
	controller?.abort()
	controller = new AbortController()
	const { signal } = controller

	const element = sheet.value
	if (element === null) {
		return
	}

	try {
		const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay')

		// A .mxl is a zip holding the score, a .musicxml is the score
		// itself. The renderer tells them apart by looking, so both are
		// handed over as they came off the wire rather than decoded here.
		const response = await axios.get(props.file.encodedSource, {
			responseType: 'blob',
			signal,
		})
		if (signal.aborted) {
			return
		}

		display?.clear()
		const osmd = new OpenSheetMusicDisplay(element, {
			autoResize: true,
			// The viewer's backdrop is dark whatever the server theme is
			darkMode: true,
		})
		await osmd.load(response.data as Blob)
		if (signal.aborted) {
			return
		}

		// The viewer keeps a handler hidden until it says it has loaded, and
		// an element that is not displayed has no width to draw into. Say so
		// first, then draw once the frame it was given is really there.
		display = osmd
		emit('loaded')
		await widthOf(element)
		if (signal.aborted) {
			return
		}
		osmd.render()
	} catch (error) {
		if (signal.aborted) {
			return
		}
		logger.error('Could not render the sheet music', { error })
		emit('errored', new Error(t('Failed to load sheet music.')))
	}
}

// Drawing needs the element, which a watcher running during setup would
// not have yet, so the first draw waits for the mount and the watcher
// covers only the moves from one file to the next
onMounted(() => void draw())
watch(() => props.file.source, () => void draw())

// The viewer measures the room it has after the handler is mounted, so the
// first draw can land in a frame of no width and come out as a score zero
// pixels wide. Draw it again against the size that arrived.
watch([() => props.maxWidth, () => props.maxHeight], () => {
	try {
		display?.render()
	} catch (error) {
		logger.debug('Could not redraw the sheet music at the new size', { error })
	}
})

onUnmounted(() => {
	controller?.abort()
	display?.clear()
	display = null
})
</script>

<style scoped>
.sheetmusic {
	overflow: auto;
}

.sheetmusic__sheet {
	/* The renderer draws onto a white page, which needs its own ground
	   rather than the viewer's dark backdrop showing through the staves */
	margin: 0 auto;
	padding: 16px;
	max-width: 1200px;
	background-color: #fff;
}
</style>
