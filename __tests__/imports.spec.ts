/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every source file of the library, with its contents.
 *
 * @param directory - Where to start from
 */
function sources(directory = 'lib'): Array<{ path: string, code: string }> {
	const found: Array<{ path: string, code: string }> = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name)
		if (entry.isDirectory()) {
			found.push(...sources(path))
		} else if (/\.(ts|vue)$/.test(entry.name)) {
			found.push({ path, code: readFileSync(path, 'utf8') })
		}
	}
	return found
}

/**
 * The files whose code matches, by path.
 *
 * @param pattern - What to look for
 */
function importing(pattern: RegExp): string[] {
	return sources().filter(({ code }) => pattern.test(code)).map(({ path }) => path)
}

// What a consumer's bundler is asked to resolve is the library's business:
// these are the two ways a chunk quietly grows by a few hundred kilobytes
// without anything failing to build.
describe('what the library imports', () => {
	// The root of @nextcloud/vue is a barrel of every component it has, and a
	// bundler that cannot shake it apart hands the lot to whoever imports it
	it('reaches for a component of @nextcloud/vue, never the whole of it', () => {
		expect(importing(/from '@nextcloud\/vue'/)).toEqual([])
	})

	// The sanitizer is for svg alone, and an svg is a small share of the
	// images anyone opens: it belongs behind the branch that uses it
	it('loads the sanitizer only where it sanitizes', () => {
		expect(importing(/^import DOMPurify from 'dompurify'/m)).toEqual([])
	})
})
