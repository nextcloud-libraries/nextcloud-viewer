/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { isVideojsElement } from '../build/videojsElements.ts'

export default defineConfig({
	root: import.meta.dirname,
	plugins: [vue({ template: { compilerOptions: { isCustomElement: isVideojsElement } } })],
	define: {
		// No bundled translations while serving the playground
		__TRANSLATIONS__: '[]',
		__TRANSLATIONS_EAGER__: '[]',
		// The version this copy would offer as a candidate
		__VIEWER_VERSION__: '"0.0.0-playground"',
	},
})
