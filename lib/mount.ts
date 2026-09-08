/*!
 * SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createApp } from 'vue'
import Viewer from './views/Viewer.vue'
import plyrIcons from './img/plyr.svg?raw'
import { registerAudioCustomElement } from './models/audios.ts'
import { registerImageCustomElement } from './models/images.ts'
import { registerVideoCustomElement } from './models/videos.ts'
import { logger } from './services/logger.ts'
import { getViewer } from './viewer.ts'

/**
 * Mount the viewer and hand it to the shared service.
 *
 * This module is the heavy half of the library and is only ever reached
 * through a dynamic import, from the copy that wins the election, the
 * first time a file is opened. Importing the package does not pull it in.
 */
export async function mount(): Promise<void> {
	// The elements the built-in handlers name. Defining them here rather
	// than at registration is what keeps registering a handler cheap:
	// nothing can render one before the viewer itself exists anyway.
	await Promise.all([
		registerAudioCustomElement(),
		registerImageCustomElement(),
		registerVideoCustomElement(),
	])

	const ViewerApp = createApp(Viewer)

	const ViewerRoot = document.createElement('div')
	ViewerRoot.id = 'viewer'
	document.body.appendChild(ViewerRoot)

	// Controls for the video viewer. Needed as Firefox CSP blocks loading
	// the svg through the normal plyr system
	const VideoControls = document.createElement('div')
	VideoControls.innerHTML = plyrIcons
	VideoControls.style.display = 'none'
	document.body.appendChild(VideoControls)

	const ViewerInstance = ViewerApp.mount(ViewerRoot)
	getViewer()._setViewer(ViewerInstance as InstanceType<typeof Viewer>)
	logger.info('Viewer mounted', { ViewerInstance })
}
