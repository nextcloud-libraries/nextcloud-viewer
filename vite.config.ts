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

/**
 * The strings the package can show before the viewer is loaded: the file
 * actions it registers on import, and the handler names listed under
 * "Open with …". Every other string belongs to the viewer itself and
 * arrives with it.
 *
 * A string used by the entry but missing here is not an error, it just
 * shows untranslated, so keep it in sync when adding one.
 */
const eagerMessages = new Set([
	'View',
	'Open with …',
	'Open with {handler}',
	'Images',
	'Video player',
	'Audio player',
])

// The full catalog is ~200 kB of the bundle, which is far too much to put
// on every page of the server for six strings. The entry carries those six
// in every locale, the rest is a chunk the viewer pulls in as it mounts.
const eagerTranslations = translations.map(({ locale, json }) => ({
	locale,
	// The gettext builder reads the messages of the empty context and takes
	// the plural rule from the language, so the po headers and every other
	// context can go: for six strings they are most of what would be left.
	json: {
		headers: {},
		translations: {
			'': Object.fromEntries(Object.entries(json.translations[''] ?? {}).filter(([msgid]) => eagerMessages.has(msgid))),
		},
	},
}))

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
			__TRANSLATIONS_EAGER__: JSON.stringify(eagerTranslations),
			// A copy has to know its own version to offer itself as a candidate
			__VIEWER_VERSION__: JSON.stringify(version),
		},
		DTSPluginOptions: {
			rollupTypes: env.mode === 'production',
		},
	})(env)
}) as UserConfigFn
