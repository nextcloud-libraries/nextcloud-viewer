/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Read Stryker's JSON report and say which tests audit nothing.
 *
 * A test that runs mutated code, yet fails on none of the changes made to
 * it, would pass whatever that code did: it covers the code without
 * checking it. Tests that run none of the mutated code are not listed:
 * the mutation run is scoped to the logic, and a component test is not
 * expected to catch a change it never ran.
 *
 * It needs `disableBail` in stryker.config.json: Stryker otherwise stops
 * at the first test that fails for a change, and every other test that
 * would have failed too looks as if it caught nothing.
 *
 * Writes a markdown summary to stdout, and `unchecked=<count>` to
 * `$GITHUB_OUTPUT` when run in a workflow. For a pull request, which only
 * mutates the files it changed:
 * - `ONLY_TESTS`, test file paths separated by spaces, limits the list to
 *   those files: another test may well check the changed code's callers
 *   rather than the code itself;
 * - `LIST_SURVIVORS=1` also lists the changes no test caught.
 */
import { appendFileSync, readFileSync } from 'node:fs'
import process from 'node:process'

const report = JSON.parse(readFileSync(process.argv[2] ?? 'mutation-report/mutation.json', 'utf8'))

const covering = new Set()
const killing = new Set()
const counts = {}
for (const file of Object.values(report.files)) {
	for (const mutant of file.mutants) {
		counts[mutant.status] = (counts[mutant.status] ?? 0) + 1
		for (const id of mutant.coveredBy ?? []) {
			covering.add(id)
		}
		for (const id of mutant.killedBy ?? []) {
			killing.add(id)
		}
	}
}

const onlyTests = process.env.ONLY_TESTS?.split(/\s+/).filter(Boolean)

const unchecked = []
for (const [path, testFile] of Object.entries(report.testFiles ?? {})) {
	if (onlyTests && !onlyTests.includes(path)) {
		continue
	}
	for (const test of testFile.tests) {
		if (covering.has(test.id) && !killing.has(test.id)) {
			unchecked.push({ path, name: test.name, line: test.location?.start?.line })
		}
	}
}

const detected = (counts.Killed ?? 0) + (counts.Timeout ?? 0)
const valid = detected + (counts.Survived ?? 0) + (counts.NoCoverage ?? 0)
const score = valid === 0 ? 100 : (100 * detected / valid)

const lines = [
	`Mutation score: **${score.toFixed(2)}%** (${detected} caught, ${counts.Survived ?? 0} survived, ${counts.NoCoverage ?? 0} not covered).`,
	'',
]
if (unchecked.length === 0) {
	lines.push('Every test that runs mutated code catches at least one change.')
} else {
	lines.push(`${unchecked.length} test(s) run mutated code but fail on none of the changes made to it, so they would pass whatever that code did:`, '')
	for (const { path, name, line } of unchecked.sort((a, b) => a.path.localeCompare(b.path))) {
		lines.push(`- \`${path}${line ? `:${line}` : ''}\`: ${name}`)
	}
}
if (process.env.LIST_SURVIVORS === '1') {
	const survivors = Object.entries(report.files).flatMap(([path, file]) => file.mutants
		.filter((mutant) => mutant.status === 'Survived' || mutant.status === 'NoCoverage')
		.map((mutant) => `- \`${path}:${mutant.location.start.line}\`: ${mutant.mutatorName}${mutant.replacement ? `, \`${mutant.replacement.replace(/\s+/g, ' ').slice(0, 80)}\`` : ''}${mutant.status === 'NoCoverage' ? ' (no test runs it)' : ''}`))
	lines.push('', survivors.length === 0 ? 'No change went unnoticed.' : `Changes no test caught (${survivors.length}):`, '', ...survivors)
}

process.stdout.write(lines.join('\n') + '\n')

if (process.env.GITHUB_OUTPUT) {
	appendFileSync(process.env.GITHUB_OUTPUT, `unchecked=${unchecked.length}\n`)
}
