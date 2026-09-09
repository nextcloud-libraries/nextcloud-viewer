/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Guard what importing this package costs.
 *
 * Registering a handler has to stay cheap: an app does it on every page, and
 * the viewer itself is meant to arrive only when a file is opened. That holds
 * as long as nothing the entry reaches *statically* drags the viewer in with
 * it, which a single top-level import of a component is enough to undo — the
 * build still succeeds, the bundle just quietly grows by a few hundred
 * kilobytes on every page of every consumer.
 *
 * So this walks the static import graph from the entry, adds it up, and fails
 * if it is bigger than it should be or if a chunk that must be lazy turns up
 * in it.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

/** What the entry may cost, gzipped, before anyone has opened a file */
const BUDGET_GZIP = 40 * 1024

/** Chunks that must only ever be reached through a dynamic import */
const MUST_BE_LAZY = ['mount', 'Images', 'Videos', 'Audios', 'ImageEditor', 'usePlyrPlayer']

const ENTRY = 'dist/index.mjs'

/**
 * Every file reachable from the entry without a dynamic import.
 *
 * Bare specifiers are externals the consumer already has, so they cost
 * nothing here; only relative imports are part of what we ship.
 *
 * @param entry the file to start from
 */
function staticGraph(entry) {
	const seen = new Set()
	const queue = [entry]

	while (queue.length > 0) {
		const file = queue.shift()
		if (seen.has(file)) {
			continue
		}
		seen.add(file)

		const source = readFileSync(file, 'utf8')
		// `import x from "./y"` and `export … from "./y"`, but never `import("./y")`
		for (const match of source.matchAll(/(?<!\bimport\s*\(\s*)["']([^"']+)["']/g)) {
			const specifier = match[1]
			if (!specifier.startsWith('.')) {
				continue
			}
			const before = source.slice(Math.max(0, match.index - 30), match.index)
			if (/import\s*\($/.test(before)) {
				continue
			}
			if (!/\b(from|import|export)\b[^;]*$/.test(before)) {
				continue
			}
			queue.push(resolve(dirname(file), specifier))
		}
	}

	return [...seen]
}

const files = staticGraph(resolve(ENTRY))
let raw = 0
let gzip = 0

console.info('What importing @nextcloud/viewer costs before a file is opened:\n')
for (const file of files.sort()) {
	const contents = readFileSync(file)
	raw += contents.length
	gzip += gzipSync(contents).length
	console.info(`  ${String(contents.length).padStart(8)}  ${relative(process.cwd(), file)}`)
}
console.info(`\n  ${String(raw).padStart(8)}  total, ${(gzip / 1024).toFixed(1)} kB gzipped (budget ${(BUDGET_GZIP / 1024).toFixed(0)} kB)\n`)

const eager = files.map((file) => file.replace(/.*\/([^/]+)\.mjs$/, '$1'))
const leaked = MUST_BE_LAZY.filter((chunk) => eager.includes(chunk))

if (leaked.length > 0) {
	console.error(`These are meant to load only when a file is opened, and something imports them at the top level: ${leaked.join(', ')}`)
	process.exit(1)
}

if (gzip > BUDGET_GZIP) {
	console.error(`The entry is ${(gzip / 1024).toFixed(1)} kB gzipped, over the ${(BUDGET_GZIP / 1024).toFixed(0)} kB budget.`)
	console.error('Either something now imports the viewer statically, or the budget needs raising on purpose.')
	process.exit(1)
}

console.info('Within budget.')
