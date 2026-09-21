/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { browserSupportedMimes as audioMimes } from '../lib/models/audios.ts'
import { browserSupportedMimes as imageMimes, previewSupportedMimes } from '../lib/models/images.ts'
import { supportedMimes as scoreMimes } from '../lib/models/sheetmusic.ts'
import { aliasedMimes, browserSupportedMimes as videoMimes } from '../lib/models/videos.ts'

/**
 * Every mime the handlers say they can open.
 *
 * A claim with nothing behind it is the failure this guards. The viewer
 * offered `image/avif` for a while on servers that never produced one, and
 * the audio handler claimed eleven types while a single fixture sat in the
 * playground that no test ever opened.
 */
const CLAIMED = [
	...imageMimes,
	...previewSupportedMimes,
	...videoMimes,
	...Object.keys(aliasedMimes),
	...audioMimes,
	...scoreMimes,
]

/**
 * What no playground test can cover, and why.
 *
 * Every entry here is a deliberate hole rather than a forgotten one. Take
 * one out and the test below says so, which is the point: the list has to
 * be argued for, not inherited.
 */
const NOT_COVERED_HERE: Record<string, string> = {
	// The playground has no previews endpoint, so these can only be opened
	// against a real server. They are covered by the suite in e2e-server,
	// where they currently skip for want of a capability that arrives with
	// nextcloud/server#63954.
	'image/heic': 'needs a server-rendered preview',
	'image/heif': 'needs a server-rendered preview',
	'image/tiff': 'needs a server-rendered preview',
	'image/emf': 'needs a server-rendered preview',
	'image/x-xbitmap': 'needs a server-rendered preview',
	'image/jp2': 'needs a server-rendered preview',

	// Claimed so the handler takes the file, but no engine here decodes it,
	// so a fixture would only record which browser ran the suite
	'audio/aacp': 'Chromium reports it cannot play this',
	'audio/vorbis': 'not a type any encoder writes; ogg carries vorbis',
	'video/mpeg': 'no engine decodes MPEG-1/2 video',
	'video/x-flv': 'no engine decodes Flash video',
	'video/quicktime': 'decoding depends on the codecs inside the container',
	'video/x-m4v': 'decoding depends on the codecs inside the container',
	'video/x-matroska': 'aliased to webm; decoding depends on the codecs inside',
	'video/ogg': 'Theora is not built into the engines the suite runs',
}

/** The repository root, which is where vitest runs from */
const root = process.cwd()

/** The fixtures the playground serves, as name to mime */
function playgroundFixtures(): Map<string, string> {
	const source = readFileSync(resolve(root, 'playground/App.vue'), 'utf8')
	const fixtures = new Map<string, string>()
	for (const line of source.split('\n')) {
		const match = /name: '([^']+)'.*mime: '([^']+)'/.exec(line)
		if (match) {
			fixtures.set(match[1]!, match[2]!)
		}
	}
	return fixtures
}

/** The fixture names the end-to-end specs actually open */
function openedByTests(): Set<string> {
	const dir = resolve(root, 'e2e')
	const opened = new Set<string>()
	for (const entry of readdirSync(dir)) {
		if (!entry.endsWith('.spec.ts')) {
			continue
		}
		const source = readFileSync(join(dir, entry), 'utf8')
		for (const match of source.matchAll(/open\(\s*'([^']+)'/g)) {
			opened.add(match[1]!)
		}
		// Table-driven specs list their fixtures rather than calling open
		// with a literal, so take the file names they name as well
		for (const match of source.matchAll(/'([\w.-]+\.(?:jpg|jpeg|png|gif|bmp|webp|ico|apng|avif|svg|tiff|heic|jp2|musicxml|mxl|mp3|mp4|wav|flac|ogg|webm|m4a|aac))'/g)) {
			opened.add(match[1]!)
		}
	}
	return opened
}

describe('what the handlers claim', () => {
	const fixtures = playgroundFixtures()
	const opened = openedByTests()

	/** The mimes some fixture carries and some spec opens */
	const covered = new Set([...fixtures.entries()]
		.filter(([name]) => opened.has(name))
		.map(([, mime]) => mime))

	it.each(CLAIMED.filter((mime) => !(mime in NOT_COVERED_HERE)))(
		'%s is opened by a test',
		(mime) => {
			expect(covered.has(mime), `no playground fixture with mime ${mime} is opened by any spec`).toBe(true)
		},
	)

	it('has a reason for each type it does not cover', () => {
		// Guards the excuse list rather than the code: a mime that stopped
		// being claimed should stop being excused, or the next person
		// inherits a reason for something that no longer exists
		const stale = Object.keys(NOT_COVERED_HERE).filter((mime) => !CLAIMED.includes(mime))
		expect(stale, 'excused but no longer claimed by any handler').toEqual([])
	})

	it('does not excuse a type that is covered anyway', () => {
		const excused = Object.keys(NOT_COVERED_HERE).filter((mime) => covered.has(mime))
		expect(excused, 'excused, but a test does open one').toEqual([])
	})
})
