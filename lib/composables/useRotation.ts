/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile } from '@nextcloud/files'
import type { Ref } from 'vue'

import axios from '@nextcloud/axios'
import { showError } from '@nextcloud/dialogs'
import { emit as emitBus } from '@nextcloud/event-bus'
import { Permission } from '@nextcloud/files'
import { readJpegOrientation, rotateOrientation, setJpegOrientation } from '@nextcloud/image-editor/jpeg'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { logger } from '../services/logger.ts'
import { t } from '../utils/l10n.ts'

/**
 * How long the viewer waits after the last turn before writing.
 *
 * Every write makes a version of the file, so writing a turn per click
 * would leave four copies of a photo in the version history on the way
 * round a full circle. Waiting for the user to settle writes the net turn
 * once, and costs nothing when they only meant to turn it one quarter.
 */
const QUIET_MS = 1200

/** The only format carrying an orientation this stack honours */
const ROTATABLE_MIME = 'image/jpeg'

/**
 * A rotation the viewer shows at once and writes to the file shortly after.
 *
 * The turn is shown by rotating the element, which is instant and costs
 * nothing, while the file is amended in the background by rewriting its
 * Exif orientation tag. Nothing is decoded and nothing is re-encoded, so
 * the picture is the same picture however many times it is turned. That
 * tag is also what the server's preview generator reads, so once the write
 * lands the new framing follows the file everywhere: the Files grid,
 * Photos, the mobile clients.
 *
 * @param file the file on screen
 */
export function useRotation(file: Ref<IFile | undefined>) {
	/** Quarter turns anticlockwise the viewer is showing, beyond the file's own */
	const turns = ref(0)

	/** Whether a write is in flight, so a caller can show it */
	const saving = ref(false)

	/**
	 * The turns not yet written, and the file they belong to. Held apart
	 * from `file` because a write outlives the view: turning a picture and
	 * moving straight on has to amend the one that was turned.
	 */
	let pending = 0
	let target: IFile | undefined
	let timer: ReturnType<typeof setTimeout> | undefined

	/**
	 * The version last written for a file, against which the next turn
	 * guards. Kept here rather than on the file because the preview URL
	 * carries the etag: moving it would reload the element to a freshly
	 * turned preview while the turn is still being shown on top.
	 */
	const versions = new Map<string, string>()

	/** How many writes are in flight, so the last one out clears the flag */
	let writing = 0

	/**
	 * Whether the file on screen can be turned.
	 *
	 * Both halves matter. Only a JPEG carries an orientation that the
	 * browser and the preview generator both honour, and only a file the
	 * user may write can keep one. Offering the turn anywhere else means a
	 * rotation that quietly fails to stick.
	 */
	const canRotate = computed(() => file.value?.mime === ROTATABLE_MIME
		&& ((file.value?.permissions ?? Permission.NONE) & Permission.UPDATE) !== 0)

	/** Turn the picture on screen a quarter anticlockwise */
	function rotateLeft(): void {
		if (file.value === undefined || !canRotate.value) {
			return
		}
		// A turn owed on another file is written before this one takes
		// over, rather than being dropped
		if (target !== undefined && target.source !== file.value.source) {
			void save()
		}
		target = file.value
		pending++
		turns.value = (turns.value + 1) % 4
		clearTimeout(timer)
		timer = setTimeout(() => void save(), QUIET_MS)
	}

	/**
	 * Write whatever turns are owed, if any.
	 *
	 * Nothing is written for a picture turned the whole way round: four
	 * quarters leave the file as it was, and a version of a file that did
	 * not change is worse than no version at all.
	 */
	async function save(): Promise<void> {
		clearTimeout(timer)
		const owed = pending % 4
		const node = target
		pending = 0
		target = undefined
		if (node === undefined || owed === 0) {
			return
		}

		writing++
		saving.value = true
		try {
			const response = await axios.get(node.encodedSource, { responseType: 'arraybuffer' })
			const bytes = new Uint8Array(response.data as ArrayBuffer)

			let orientation = readJpegOrientation(bytes)
			for (let turn = 0; turn < owed; turn++) {
				orientation = rotateOrientation(orientation, 'left')
			}
			const written = setJpegOrientation(bytes, orientation)
			if (written === null) {
				logger.error('Could not write the orientation of this JPEG', { source: node.source })
				showError(t('This image could not be rotated'))
				return
			}

			const known = versions.get(node.source) ?? node.attributes?.etag as string | undefined
			const result = await axios.put(node.encodedSource, new Blob([written], { type: ROTATABLE_MIME }), {
				headers: known ? { 'If-Match': `"${String(known).replace(/&quot;|"/g, '')}"` } : undefined,
			})

			const saved = result.headers?.['oc-etag'] ?? result.headers?.etag
			if (saved) {
				versions.set(node.source, String(saved).replace(/"/g, ''))
			}

			emitBus('files:node:updated', node)
		} catch (error) {
			logger.error('Failed to rotate the image', { error })
			if ((error as { response?: { status?: number } }).response?.status === 412) {
				showError(t('The file was changed elsewhere. Reload the page to rotate it.'))
			} else {
				showError(t('Could not rotate the image'))
			}
		} finally {
			writing--
			saving.value = writing > 0
		}
	}

	// Moving to another file writes what is owed on the one being left,
	// and starts the new one square
	watch(() => file.value?.source, () => {
		void save()
		turns.value = 0
	})

	onScopeDispose(() => {
		void save()
	})

	return { canRotate, rotateLeft, saving, turns }
}
