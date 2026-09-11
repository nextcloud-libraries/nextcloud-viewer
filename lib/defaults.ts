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
 * The server calls this from an init script on every page, so an app only
 * needs to when it hosts the viewer on a page of its own. Importing the
 * package deliberately does not: with several copies on a page, each one
 * registering would only warn about the others. Any call after the first
 * does nothing.
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
