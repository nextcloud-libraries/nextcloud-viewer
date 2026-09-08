/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { registerAudioHandler } from './models/audios.ts'
import { registerImageHandler } from './models/images.ts'
import { registerVideoHandler } from './models/videos.ts'

/**
 * Register the handlers for the file types the viewer shows out of the box:
 * images, video and audio.
 *
 * Call this early, from a script loaded with `\OCP\Util::addInitScript`.
 * Registering a handler is what puts the viewer's actions in the Files
 * list, and those are read when the list first renders — register late
 * and the file is not clickable yet. It costs nothing but the handler
 * definitions: the viewer itself is loaded when a file is opened.
 */
export function registerDefaultHandlers(): void {
	registerAudioHandler()
	registerVideoHandler()
	registerImageHandler()
}
