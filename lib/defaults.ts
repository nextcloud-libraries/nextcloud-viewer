/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { registerAudioHandler } from './models/audios.ts'
import { registerImageHandler } from './models/images.ts'
import { registerVideoHandler } from './models/videos.ts'

let registered = false

/**
 * Register the handlers for the file types the viewer shows out of the box:
 * images, video and audio.
 *
 * Importing the package does this, so there is normally nothing to call.
 * It stays exported for a consumer that wants them registered at a point
 * of its own choosing, and does nothing on any call after the first.
 */
export function registerDefaultHandlers(): void {
	if (registered) {
		return
	}
	registered = true

	registerAudioHandler()
	registerVideoHandler()
	registerImageHandler()
}
