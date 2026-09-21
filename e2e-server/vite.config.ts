/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createAppConfig } from '@nextcloud/vite-config'
import { fileURLToPath } from 'node:url'

/**
 * The harness app's bundle.
 *
 * Built into the app directory itself, because that directory is what gets
 * bind mounted into the container: anything left outside it never reaches
 * the server.
 */
export default createAppConfig({
	main: fileURLToPath(new URL('src/main.ts', import.meta.url)),
}, {
	appName: 'viewer_e2e',
	config: {
		root: fileURLToPath(new URL('.', import.meta.url)),
		build: {
			outDir: fileURLToPath(new URL('.', import.meta.url)),
			emptyOutDir: false,
		},
	},
	inlineCSS: true,
	minify: false,
})
