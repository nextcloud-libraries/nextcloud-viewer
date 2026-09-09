/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type ViewerVue from '../lib/views/Viewer.vue'

import { describe, expect, it, vi } from 'vitest'
import { registerImplementation, scope } from '../lib/scope.ts'
import { getViewer, Viewer } from '../lib/viewer.ts'
import { makeFile } from './factories.ts'

type Mounted = InstanceType<typeof ViewerVue>

/**
 * A stand-in for the mounted Vue component, with every method the service
 * forwards to.
 */
function makeMounted() {
	return {
		open: vi.fn(),
		openFolder: vi.fn(),
		compare: vi.fn(),
		goTo: vi.fn(),
		close: vi.fn(),
		setEditing: vi.fn(),
	}
}

/**
 * Offer an implementation whose load hands the given component to the service,
 * the way `mount.ts` does. Returns how many times it was loaded.
 */
function offerImplementation(mounted: ReturnType<typeof makeMounted>, version = '2.0.0') {
	const load = vi.fn(async () => {
		getViewer()._setViewer(mounted as unknown as Mounted)
	})
	registerImplementation({ version, load })
	return load
}

describe('getViewer()', () => {
	it('hands out one instance for the whole page', () => {
		const first = getViewer()
		expect(first).toBeInstanceOf(Viewer)
		expect(getViewer()).toBe(first)
		// Kept on the shared scope, so another copy of the library gets the same one
		expect(scope.service).toBe(first)
	})

	it('is an EventTarget', () => {
		expect(getViewer()).toBeInstanceOf(EventTarget)
	})
})

describe('opening before anything is mounted', () => {
	it('loads the implementation first, once, then forwards the call', async () => {
		const mounted = makeMounted()
		const load = offerImplementation(mounted)
		const files = [makeFile(), makeFile()]

		await getViewer().open(files, files[1])
		await getViewer().open(files, files[0])

		expect(load).toHaveBeenCalledTimes(1)
		expect(mounted.open).toHaveBeenCalledTimes(2)
		expect(mounted.open).toHaveBeenLastCalledWith(files, files[0], expect.any(Object), undefined)
	})

	it('forwards the options and handler id untouched', async () => {
		const mounted = makeMounted()
		offerImplementation(mounted)
		const file = makeFile()
		const options = { enableSidebar: false, canLoop: false }

		await getViewer().open([file], file, options, 'my-handler')

		expect(mounted.open).toHaveBeenCalledWith([file], file, options, 'my-handler')
	})

	it('fills in defaults when the caller passes no options', async () => {
		const mounted = makeMounted()
		offerImplementation(mounted)
		const file = makeFile()

		await getViewer().open([file], file)

		const options = mounted.open.mock.calls[0]![2]
		expect(options).toMatchObject({ canLoop: true, enableSidebar: true })
		expect(await options.loadMore()).toEqual([])
	})

	it('forwards openFolder and compare the same way', async () => {
		const mounted = makeMounted()
		offerImplementation(mounted)
		const folder = { type: 'folder' } as never
		const a = makeFile()
		const b = makeFile()

		await getViewer().openFolder(folder, a, undefined, 'h')
		await getViewer().compare(a, b, 'h')

		expect(mounted.openFolder).toHaveBeenCalledWith(folder, a, expect.any(Object), 'h')
		expect(mounted.compare).toHaveBeenCalledWith(a, b, 'h')
	})

	it('rejects when no copy of the library offered an implementation', async () => {
		await expect(getViewer().open([makeFile()])).rejects.toThrow('No viewer implementation is available on this page')
	})

	it('rejects when the winning implementation never mounted itself', async () => {
		registerImplementation({ version: '2.0.0', load: async () => {} })

		await expect(getViewer().open([makeFile()])).rejects.toThrow('The viewer implementation did not register itself')
	})

	it('loads the newest offered copy', async () => {
		const older = makeMounted()
		const newer = makeMounted()
		offerImplementation(older, '2.0.0')
		offerImplementation(newer, '2.3.0')

		await getViewer().open([makeFile()])

		expect(newer.open).toHaveBeenCalledTimes(1)
		expect(older.open).not.toHaveBeenCalled()
	})
})

describe('the synchronous methods', () => {
	it('do nothing before the viewer is mounted, as there is nothing open to act on', () => {
		const viewer = getViewer()
		expect(() => {
			viewer.goTo(1)
			viewer.close()
			viewer.setEditing(true)
		}).not.toThrow()
	})

	it('forward once it is', () => {
		const mounted = makeMounted()
		const viewer = getViewer()
		viewer._setViewer(mounted as unknown as Mounted)

		viewer.goTo(42)
		viewer.close()
		viewer.setEditing(true)

		expect(mounted.goTo).toHaveBeenCalledWith(42)
		expect(mounted.close).toHaveBeenCalledTimes(1)
		expect(mounted.setEditing).toHaveBeenCalledWith(true)
	})
})
