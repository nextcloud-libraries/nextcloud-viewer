/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFileAction as FileAction } from '@nextcloud/files'

import { Permission } from '@nextcloud/files'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Capture every FileAction registered by the API package so we can inspect
// their enabled()/exec() without a live Files app.
const { registered } = vi.hoisted(() => ({ registered: [] as FileAction[] }))
vi.mock('@nextcloud/files', async (orig) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest importOriginal idiom
	const actual = await orig<typeof import('@nextcloud/files')>()
	return {
		...actual,
		registerFileAction: (action: FileAction) => registered.push(action),
		getFileActions: () => registered,
	}
})

// Stub the viewer so exec() can be asserted without a real Viewer instance.
vi.mock('../lib/viewer.ts')

import { Folder } from '@nextcloud/files'
import { getHandlers, registerHandler } from '../lib/index.ts'
import { logger } from '../lib/services/logger.ts'
import { getViewer } from '../lib/viewer.ts'
import { makeFile, makeHandler } from './factories.ts'

const ACTION_VIEWER = 'viewer-open'
const ACTION_VIEWER_MENU = 'viewer-open-with'

// The shared manual mock returns a stable spied viewer.
const viewer = vi.mocked(getViewer())

/**
 * Find a captured FileAction by its id.
 *
 * @param id - The action id to look up
 */
function action(id: string): FileAction | undefined {
	return registered.find((a) => a.id === id)
}

/**
 * Build a folder node (never viewable by the handlers).
 */
function makeFolder(): Folder {
	return new Folder({
		source: 'https://cloud.example.com/remote.php/dav/files/admin/folder',
		root: '/files/admin',
		owner: 'admin',
	})
}

/**
 * Wrap nodes in the minimal action context the API package reads.
 *
 * @param nodes - Nodes for the context
 */
const VIEW = { id: 'files' } as never
const FOLDER = { path: '/folder' } as never
function ctx(nodes: unknown[]) {
	return { nodes, contents: nodes, view: VIEW, folder: FOLDER } as never
}

beforeEach(() => {
	registered.length = 0
	viewer.open.mockClear()
	// setup.ts already resets the shared scope, handlers included, before each test.
})

describe('registerHandler validation', () => {
	it('throws on empty id', () => {
		expect(() => registerHandler(makeHandler({ id: '' })))
			.toThrow('Handler id must be a non-empty string')
	})

	it('throws on empty displayName', () => {
		expect(() => registerHandler(makeHandler({ displayName: '' })))
			.toThrow('Handler displayName must be a non-empty string')
	})

	it('throws on empty tagName', () => {
		expect(() => registerHandler(makeHandler({ tagName: '' })))
			.toThrow('Handler tagName must be a non-empty string')
	})

	it('throws on non-function enabled', () => {
		expect(() => registerHandler(makeHandler({ enabled: 'nope' as never })))
			.toThrow('Handler enabled must be a function')
	})

	it('throws on invalid theme', () => {
		expect(() => registerHandler(makeHandler({ theme: 'blue' as never })))
			.toThrow("Handler theme must be one of 'dark', 'light', 'default' if provided")
	})

	it('throws on a tagName without a hyphen', () => {
		expect(() => registerHandler(makeHandler({ tagName: 'nohyphen' })))
			.toThrow('Handler tagName must contain a hyphen (-)')
	})

	it('throws on a tagName starting with an uppercase letter', () => {
		expect(() => registerHandler(makeHandler({ tagName: 'Oca-viewer' })))
			.toThrow('Handler tagName must not start with an uppercase letter')
	})

	it('throws on a tagName with consecutive hyphens', () => {
		expect(() => registerHandler(makeHandler({ tagName: 'oca--viewer' })))
			.toThrow('Handler tagName must not contain consecutive hyphens (--)')
	})

	it('throws on a tagName starting with a hyphen', () => {
		expect(() => registerHandler(makeHandler({ tagName: '-oca-viewer' })))
			.toThrow('Handler tagName must not start or end with a hyphen (-)')
	})

	it('takes a tagName starting with an app id that has an underscore', () => {
		expect(() => registerHandler(makeHandler({ id: 'pdf', tagName: 'files_pdfviewer-viewer-handler' })))
			.not.toThrow()
	})

	it('throws on a tagName with any other character', () => {
		expect(() => registerHandler(makeHandler({ tagName: 'oca-viewer.pdf' })))
			.toThrow('Handler tagName must only contain lowercase letters, numbers, underscores (_) and hyphens (-)')
	})

	it('throws on a tagName ending with a hyphen', () => {
		expect(() => registerHandler(makeHandler({ tagName: 'oca-viewer-' })))
			.toThrow('Handler tagName must not start or end with a hyphen (-)')
	})
})

describe('registerHandler registry', () => {
	it('warns and does not double-register the same id', () => {
		const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})

		registerHandler(makeHandler({ id: 'dup' }))
		// Another handler, not the same one registered twice
		registerHandler(makeHandler({ id: 'dup', tagName: 'other-app-dup' }))

		expect(warn).toHaveBeenCalledTimes(1)
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('dup'))
		expect(getHandlers().size).toBe(1)

		warn.mockRestore()
	})

	it('registers the shared actions only once across handlers', () => {
		registerHandler(makeHandler({ id: 'one', tagName: 'oca-viewer-one' }))
		registerHandler(makeHandler({ id: 'two', tagName: 'oca-viewer-two' }))

		expect(registered.filter((a) => a.id === ACTION_VIEWER)).toHaveLength(1)
		expect(registered.filter((a) => a.id === ACTION_VIEWER_MENU)).toHaveLength(1)
	})
})

describe('action gate', () => {
	it('with one matching handler: default enabled, "Open with …" not enabled', () => {
		registerHandler(makeHandler({ id: 'only', tagName: 'oca-viewer-only', enabled: () => true }))
		const file = makeFile()

		expect(action(ACTION_VIEWER)!.enabled!(ctx([file]))).toBe(true)
		expect(action(ACTION_VIEWER_MENU)!.enabled!(ctx([file]))).toBe(false)
	})

	it('with two matching handlers: "Open with …" is enabled', () => {
		registerHandler(makeHandler({ id: 'a', tagName: 'oca-viewer-a', enabled: () => true }))
		registerHandler(makeHandler({ id: 'b', tagName: 'oca-viewer-b', enabled: () => true }))
		const file = makeFile()

		expect(action(ACTION_VIEWER)!.enabled!(ctx([file]))).toBe(true)
		expect(action(ACTION_VIEWER_MENU)!.enabled!(ctx([file]))).toBe(true)
	})

	it('is never enabled for folders', () => {
		registerHandler(makeHandler({ id: 'a', tagName: 'oca-viewer-a', enabled: () => true }))
		registerHandler(makeHandler({ id: 'b', tagName: 'oca-viewer-b', enabled: () => true }))
		const folder = makeFolder()

		expect(action(ACTION_VIEWER)!.enabled!(ctx([folder]))).toBe(false)
		expect(action(ACTION_VIEWER_MENU)!.enabled!(ctx([folder]))).toBe(false)
	})

	it('is not enabled for a file the user cannot read', () => {
		registerHandler(makeHandler({ id: 'a', tagName: 'oca-viewer-a', enabled: () => true }))
		const file = makeFile({ permissions: Permission.NONE })

		expect(action(ACTION_VIEWER)!.enabled!(ctx([file]))).toBe(false)
		expect(action(ACTION_VIEWER_MENU)!.enabled!(ctx([file]))).toBe(false)
	})

	it('is enabled for a file that is only readable, as deleted files are', () => {
		registerHandler(makeHandler({ id: 'a', tagName: 'oca-viewer-a', enabled: () => true }))
		// The trashbin reports its files as GD: readable and deletable
		const file = makeFile({ permissions: Permission.READ | Permission.DELETE })

		expect(action(ACTION_VIEWER)!.enabled!(ctx([file]))).toBe(true)
	})

	it('is not enabled when one of several files cannot be read', () => {
		registerHandler(makeHandler({ id: 'a', tagName: 'oca-viewer-a', enabled: () => true }))
		const readable = makeFile()
		const other = makeFile({ permissions: Permission.NONE })

		expect(action(ACTION_VIEWER)!.enabled!(ctx([readable, other]))).toBe(false)
	})

	it('is not enabled when no handler matches the file', () => {
		registerHandler(makeHandler({ id: 'none', tagName: 'oca-viewer-none', enabled: () => false }))
		const file = makeFile()

		expect(action(ACTION_VIEWER)!.enabled!(ctx([file]))).toBe(false)
	})
})

describe('per-handler child action', () => {
	it('is enabled only when its own handler matches the file', () => {
		registerHandler(makeHandler({
			id: 'pdf',
			tagName: 'oca-viewer-pdf',
			enabled: (nodes) => nodes.every((n) => n.mime === 'application/pdf'),
		}))

		const child = action(`${ACTION_VIEWER_MENU}-pdf`)!
		expect(child.enabled!(ctx([makeFile({ mime: 'application/pdf' })]))).toBe(true)
		expect(child.enabled!(ctx([makeFile({ mime: 'image/png' })]))).toBe(false)
		expect(child.enabled!(ctx([makeFolder()]))).toBe(false)
	})

	it('forces its own handler id when opening', async () => {
		registerHandler(makeHandler({ id: 'pdf', tagName: 'oca-viewer-pdf', enabled: () => true }))
		const file = makeFile()

		await action(`${ACTION_VIEWER_MENU}-pdf`)!.exec(ctx([file]))

		expect(viewer.open).toHaveBeenCalledTimes(1)
		expect(viewer.open).toHaveBeenCalledWith([file], file, { view: VIEW, folder: FOLDER }, 'pdf')
	})

	it('default action opens without forcing a handler id', async () => {
		registerHandler(makeHandler({ id: 'pdf', tagName: 'oca-viewer-pdf', enabled: () => true }))
		const file = makeFile()

		await action(ACTION_VIEWER)!.exec(ctx([file]))

		expect(viewer.open).toHaveBeenCalledTimes(1)
		expect(viewer.open).toHaveBeenCalledWith([file], file, { view: VIEW, folder: FOLDER }, undefined)
	})
})

describe('the slideshow of a selection', () => {
	const ACTION_SLIDESHOW = 'viewer-open-slideshow'
	const images = () => makeHandler({ id: 'images', group: 'media', enabled: (nodes) => nodes.every((node) => node.mime?.startsWith('image/')) })

	it('is offered for a selection of two files or more that can all be viewed', () => {
		registerHandler(images())
		const a = makeFile({ mime: 'image/jpeg' })
		const b = makeFile({ mime: 'image/png' })

		expect(action(ACTION_SLIDESHOW)!.enabled!(ctx([a, b]))).toBe(true)
		// Nothing to step to
		expect(action(ACTION_SLIDESHOW)!.enabled!(ctx([a]))).toBe(false)
		// The viewer could not show the rest
		expect(action(ACTION_SLIDESHOW)!.enabled!(ctx([a, makeFile({ mime: 'application/zip' })]))).toBe(false)
		expect(action(ACTION_SLIDESHOW)!.enabled!(ctx([a, makeFolder()]))).toBe(false)
	})

	// The server's copy may be older, and have registered only the actions
	// it knew of before this copy's handlers arrive
	it('is registered next to the actions and handlers an older copy registered', () => {
		// What an older copy left on the page: the default handlers, and the
		// actions it knew of
		registerHandler(images())
		registered.length = 0
		registered.push({ id: ACTION_VIEWER } as FileAction, { id: ACTION_VIEWER_MENU } as FileAction)

		registerHandler(images())

		expect(action(ACTION_SLIDESHOW)).toBeDefined()
		expect(registered.filter((a) => a.id === ACTION_VIEWER)).toHaveLength(1)
	})

	it('opens the viewer on the selection with the slideshow running', async () => {
		registerHandler(images())
		const a = makeFile({ mime: 'image/jpeg' })
		const b = makeFile({ mime: 'image/png' })

		await action(ACTION_SLIDESHOW)!.execBatch!(ctx([a, b]))

		expect(viewer.open).toHaveBeenCalledWith([a, b], a, expect.objectContaining({ startSlideshow: true }), undefined)
	})
})
