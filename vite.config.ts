/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { UserConfigFn } from 'vite'

import { createLibConfig } from '@nextcloud/vite-config'
import { po as poParser } from 'gettext-parser'
import { readdirSync, readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { videojsElements } from './build/videojsElements.ts'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

const translations = readdirSync('./l10n')
	.filter((name) => name !== 'messages.pot' && name.endsWith('.pot'))
	.map((file) => {
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
 * actions it registers along with the handlers, and the handler names listed
 * under "Open with …". Every other string belongs to the viewer itself and
 * arrives with it.
 *
 * A string used by the entry but missing here is not an error, it just
 * shows untranslated, so keep it in sync when adding one.
 */
const eagerMessages = new Set([
	'View',
	'Open with …',
	'Open with {handler}',
	'Images',
	'Video player',
	'Audio player',
	'The viewer could not be loaded.',
])

// The full catalog is ~200 kB of the bundle, which is far too much to put
// on every page of the server for a handful of strings. The entry carries
// those in every locale, the rest is a chunk the viewer pulls in as it mounts.
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
		// Each chunk imports its own stylesheet, for the app bundling the
		// library to load along with that chunk. Without it the styles are
		// emitted but nothing loads them.
		inlineCSS: true,
		nodeExternalsOptions: {
			// for subpath imports like '@nextcloud/l10n/gettext'
			include: [/^@nextcloud\//],
			// Bundle the icons rather than externalizing them. They are
			// imported with vite's `?raw` suffix, which is not something a
			// consumer's bundler can be expected to understand, so it must
			// not survive into what we publish.
			exclude: [/^vue-material-design-icons\//, /^@mdi\/svg\//],
		},
		config: {
			plugins: [videojsElements],
		},

		replace: {
			__TRANSLATIONS__: JSON.stringify(translations),
			__TRANSLATIONS_EAGER__: JSON.stringify(eagerTranslations),
			// A copy has to know its own version to offer itself as a candidate.
			// The e2e app overrides it, to be elected over the copy the server bundles
			__VIEWER_VERSION__: JSON.stringify(process.env.VIEWER_VERSION ?? version),
		},
		DTSPluginOptions: {
			rollupTypes: env.mode === 'production',
		},
	})(env)
}) as UserConfigFn
