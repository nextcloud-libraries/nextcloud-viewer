/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Guard what the published build asks its consumer's bundler to resolve.
 *
 * Vite understands suffixes like `?raw` and `?url`; webpack, rollup and
 * whatever else a consumer builds with do not, unless they are configured
 * for it. They are ours to resolve at build time, so none of them may
 * survive into dist.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIRS = ['dist', 'dist/chunks']
const SUFFIXES = /["'][^"']+\?(raw|url|inline|worker)["']/g

const offenders = []
for (const dir of DIRS) {
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		if (!name.isFile() || !/\.(mjs|cjs)$/.test(name.name)) {
			continue
		}
		const file = join(dir, name.name)
		for (const match of readFileSync(file, 'utf8').matchAll(SUFFIXES)) {
			offenders.push(`${file}: ${match[0]}`)
		}
	}
}

if (offenders.length > 0) {
	console.error('Build-time import suffixes left for the consumer to resolve:\n')
	offenders.forEach((offender) => console.error(`    ${offender}`))
	console.error('\nBundle them instead, by excluding the package from nodeExternalsOptions.')
	process.exit(1)
}

console.log('No build-time import suffixes in the published build.')
