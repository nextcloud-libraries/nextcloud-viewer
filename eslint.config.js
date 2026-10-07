/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: CC0-1.0
 */

import { recommendedLibrary } from '@nextcloud/eslint-config'
import { defineConfig } from 'eslint/config'
import globals from 'globals'

export default defineConfig([
	...recommendedLibrary,

	{
		files: ['build/*.mjs'],
		// The build scripts are run in Node.js, not in a browser
		languageOptions: {
			globals: {
				...globals.node,
				...globals.nodeBuiltin,
			},
		},
		rules: {
			'no-console': 'off',
		},
	},

	{
		files: ['lib/components/**/*.vue'],
		rules: {
			// The media skins are Video.js custom elements, not components
			'vue/no-undef-components': ['warn', {
				ignorePatterns: ['RouterLink', 'RouterView', '^media-', '^video-player$', '^audio-player$'],
			}],
		},
	},
])
