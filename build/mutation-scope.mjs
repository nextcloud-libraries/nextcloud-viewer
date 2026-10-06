/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Of the files given on stdin, one per line, print those the mutation run
 * would mutate, joined with commas for `stryker run --mutate`.
 *
 * The scope is the `mutate` list of stryker.config.json, its `!` patterns
 * included, so a pull request is audited where the weekly run would be.
 */
import { readFileSync } from 'node:fs'
import { matchesGlob } from 'node:path'
import process from 'node:process'

const { mutate } = JSON.parse(readFileSync('stryker.config.json', 'utf8'))
const included = mutate.filter((pattern) => !pattern.startsWith('!'))
const excluded = mutate.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1))

const files = readFileSync(0, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean)
const inScope = files.filter((file) => included.some((pattern) => matchesGlob(file, pattern))
	&& !excluded.some((pattern) => matchesGlob(file, pattern)))

process.stdout.write(inScope.join(','))
