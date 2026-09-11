/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { registerDefaultHandlers } from './defaults.ts'
import { registerImplementation } from './scope.ts'
import { loadTranslations } from './utils/l10n.ts'
import { getViewer } from './viewer.ts'

// Offer this copy as the page's viewer. Registering costs nothing: the
// implementation chunk is only fetched by whichever copy wins, and only
// once something actually opens a file.
registerImplementation({
	version: __VIEWER_VERSION__,
	// The catalog first: modules of the viewer translate strings as they are
	// evaluated, not only as they render, so it has to be in before the first
	// of them runs.
	load: async () => {
		await loadTranslations()
		const { mount } = await import('./mount.ts')
		return mount()
	},
})

// The service exists as soon as the library is loaded, so everything holding
// a reference holds the same one whether or not a file has been opened yet.
// It is an empty shell until the viewer is mounted.
getViewer()

// Images, video and audio are what the viewer is for, so an app gets them by
// importing the package rather than by remembering to ask. It has to happen
// here, at import: the Files list reads the available actions when it first
// renders, and a handler registered after that is a file that does not open.
registerDefaultHandlers()

export { canView, getHandlers, registerHandler } from './handlers.ts'
export type { IHandler } from './handlers.ts'
export { getViewer, Viewer } from './viewer.ts'
export type { ViewerAPI, ViewerEmits, ViewerOptions, ViewerProps } from './viewer.ts'
export { registerDefaultHandlers } from './defaults.ts'
