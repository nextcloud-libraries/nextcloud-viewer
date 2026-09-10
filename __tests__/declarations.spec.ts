/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The ambient declaration files of the library.
 *
 * @param directory - Where to start from
 */
function declarations(directory = 'lib'): Array<{ path: string, code: string }> {
	const found: Array<{ path: string, code: string }> = []
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name)
		if (entry.isDirectory()) {
			found.push(...declarations(path))
		} else if (entry.name.endsWith('.d.ts')) {
			found.push({ path, code: readFileSync(path, 'utf8') })
		}
	}
	return found
}

describe('the ambient declarations', () => {
	// A module declaration for every `.vue` file answers for this library's
	// own components too, so a component whose real types stop resolving
	// silently becomes `any` instead of failing the type check
	it('declare no blanket module for every .vue file', () => {
		const blanket = declarations().filter(({ code }) => /declare module '\*\.vue'/.test(code))
		expect(blanket.map(({ path }) => path)).toEqual([])
	})

	// Two files declaring one module is one of them being edited and the
	// other quietly winning
	it('declare each module once', () => {
		const seen = new Map<string, string[]>()
		for (const { path, code } of declarations()) {
			for (const [, name] of code.matchAll(/declare module '([^']+)'/g)) {
				seen.set(name!, [...(seen.get(name!) ?? []), path])
			}
		}
		const twice = [...seen.entries()].filter(([, paths]) => paths.length > 1)
		expect(Object.fromEntries(twice)).toEqual({})
	})
})
