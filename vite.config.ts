/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createLibConfig } from '@nextcloud/vite-config'
import injectCSS from 'vite-plugin-css-injected-by-js'

import { readdirSync, readFileSync } from 'node:fs'
import { po as poParser } from 'gettext-parser'
// eslint-disable-next-line n/no-extraneous-import
import { defineConfig, type UserConfigFn } from 'vite'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

const translations = readdirSync('./l10n')
	.filter(name => name !== 'messages.pot' && name.endsWith('.pot'))
	.map(file => {
		const path = './l10n/' + file
		const locale = file.slice(0, -'.pot'.length)

		const po = readFileSync(path)
		const json = poParser.parse(po)
		return {
			locale,
			json,
		}
	})

export default defineConfig((env) => {
	return createLibConfig({
		index: 'lib/index.ts',
	}, {
		libraryFormats: ['es', 'cjs'],
		nodeExternalsOptions: {
			// for subpath imports like '@nextcloud/l10n/gettext'
			include: [/^@nextcloud\//],
			// bundle the icon SFCs instead of externalizing them
			exclude: [/^vue-material-design-icons\//],
		},
		// The styles are carried inside the javascript and injected as it
		// runs, each chunk bringing its own. Emitting stylesheets instead
		// leaves it to the consuming bundler to link a chunk's CSS when
		// that chunk loads, which is not something a library can count on:
		// in the server it did not happen, and the lazily loaded viewer
		// rendered with none of its styles.
		inlineCSS: false,
		config: {
			plugins: [injectCSS({ relativeCSSInjection: true })],
		},

		replace: {
			__TRANSLATIONS__: JSON.stringify(translations),
			// A copy has to know its own version to offer itself as a candidate
			__VIEWER_VERSION__: JSON.stringify(version),
		},
		DTSPluginOptions: {
			rollupTypes: env.mode === 'production',
		},
	})(env)
}) as UserConfigFn
