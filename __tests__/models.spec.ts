/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IHandler } from '../lib/index.ts'

import { describe, expect, it, vi } from 'vitest'
import { getHandlers } from '../lib/index.ts'
import { makeFile } from './factories.ts'

// Keep FileType/FileAction/File/Folder real, but neutralise the side effects
// that registerHandler triggers on the real file-action registry.
vi.mock('@nextcloud/files', async (original) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest importOriginal idiom
	const actual = await original<typeof import('@nextcloud/files')>()
	return {
		...actual,
		registerFileAction: () => {},
		getFileActions: () => [],
	}
})

// The model modules import their SFC at the top level, which drags in the whole
// @nextcloud/vue + media services tree (CSS assets, CommonJS deps). We only
// exercise the handler mime logic, so stub
// the components with a minimal Vue component object.
vi.mock('../lib/components/Videos.vue', () => ({ default: { name: 'Videos', render: () => null } }))
vi.mock('../lib/components/Audios.vue', () => ({ default: { name: 'Audios', render: () => null } }))
vi.mock('../lib/components/Images.vue', () => ({ default: { name: 'Images', render: () => null } }))

/**
 * Resolve a registered handler by id from the global viewer registry.
 *
 * @param id - Handler id to look up
 */
function handlerById(id: string): IHandler {
	const handler = getHandlers().get(id)
	if (!handler) {
		throw new Error(`Handler ${id} was not registered`)
	}
	return handler
}

// A folder pages through every file of the opened handler's group, so video
// and audio share one and images stay on their own
describe('handler groups', () => {
	it('puts video and audio together, images apart', async () => {
		const { registerVideoHandler } = await import('../lib/models/videos.ts')
		const { registerAudioHandler } = await import('../lib/models/audios.ts')
		const { registerImageHandler } = await import('../lib/models/images.ts')
		registerVideoHandler()
		registerAudioHandler()
		registerImageHandler()
		expect(handlerById('videos').group).toBe('media')
		expect(handlerById('audios').group).toBe('media')
		expect(handlerById('images').group).toBeUndefined()
	})
})

// Another copy of the library on the page, of a generation that keeps its
// own registry, names the same elements. `define()` throws on a name it
// already knows, and whichever mounts second would never finish mounting.
describe('the custom elements', () => {
	it.each([
		['../lib/models/images.ts', 'registerImageCustomElement'],
		['../lib/models/videos.ts', 'registerVideoCustomElement'],
		['../lib/models/audios.ts', 'registerAudioCustomElement'],
	])('defines %s once, whoever asks', async (module, register) => {
		const model = await import(module) as Record<string, () => Promise<void>>
		await model[register]!()
		await expect(model[register]!()).resolves.toBeUndefined()
		expect(window.customElements.get(model.tagname as unknown as string)).toBeDefined()
	})
})

describe('videos model', () => {
	it.each([
		'video/mpeg',
		'video/ogg',
		'video/webm',
		'video/mp4',
		'video/x-m4v',
		'video/x-flv',
		'video/quicktime',
	])('enables browser-supported mime %s', async (mime) => {
		const { registerVideoHandler } = await import('../lib/models/videos.ts')
		registerVideoHandler()
		const handler = handlerById('videos')
		expect(handler.enabled([makeFile({ mime })])).toBe(true)
	})

	it('enables the aliased mime video/x-matroska (maps to video/webm)', async () => {
		const { registerVideoHandler } = await import('../lib/models/videos.ts')
		registerVideoHandler()
		const handler = handlerById('videos')
		expect(handler.enabled([makeFile({ mime: 'video/x-matroska' })])).toBe(true)
	})

	it('disables a non-video mime', async () => {
		const { registerVideoHandler } = await import('../lib/models/videos.ts')
		registerVideoHandler()
		const handler = handlerById('videos')
		expect(handler.enabled([makeFile({ mime: 'application/pdf' })])).toBe(false)
	})

	it('disables an empty nodes array', async () => {
		const { registerVideoHandler } = await import('../lib/models/videos.ts')
		registerVideoHandler()
		const handler = handlerById('videos')
		expect(handler.enabled([])).toBe(false)
	})

	it('requires every node to match', async () => {
		const { registerVideoHandler } = await import('../lib/models/videos.ts')
		registerVideoHandler()
		const handler = handlerById('videos')
		expect(handler.enabled([
			makeFile({ mime: 'video/mp4' }),
			makeFile({ mime: 'application/pdf' }),
		])).toBe(false)
	})
})

describe('audios model', () => {
	it.each([
		'audio/aac',
		'audio/aacp',
		'audio/flac',
		'audio/mp4',
		'audio/mpeg',
		'audio/ogg',
		'audio/vorbis',
		'audio/wav',
		'audio/webm',
	])('enables browser-supported mime %s', async (mime) => {
		const { registerAudioHandler } = await import('../lib/models/audios.ts')
		registerAudioHandler()
		const handler = handlerById('audios')
		expect(handler.enabled([makeFile({ mime })])).toBe(true)
	})

	it('disables a non-audio mime', async () => {
		const { registerAudioHandler } = await import('../lib/models/audios.ts')
		registerAudioHandler()
		const handler = handlerById('audios')
		expect(handler.enabled([makeFile({ mime: 'video/mp4' })])).toBe(false)
	})

	it('disables an empty nodes array', async () => {
		const { registerAudioHandler } = await import('../lib/models/audios.ts')
		registerAudioHandler()
		const handler = handlerById('audios')
		expect(handler.enabled([])).toBe(false)
	})
})

describe('images model', () => {
	it.each([
		'image/apng',
		'image/bmp',
		'image/gif',
		'image/jpeg',
		'image/png',
		'image/svg+xml',
		'image/webp',
		'image/x-icon',
	])('enables always-browser-supported mime %s', async (mime) => {
		const { registerImageHandler } = await import('../lib/models/images.ts')
		registerImageHandler()
		const handler = handlerById('images')
		expect(handler.enabled([makeFile({ mime })])).toBe(true)
	})

	it('rejects a clearly non-image mime', async () => {
		const { registerImageHandler } = await import('../lib/models/images.ts')
		registerImageHandler()
		const handler = handlerById('images')
		expect(handler.enabled([makeFile({ mime: 'application/pdf' })])).toBe(false)
	})

	it('disables an empty nodes array', async () => {
		const { registerImageHandler } = await import('../lib/models/images.ts')
		registerImageHandler()
		const handler = handlerById('images')
		expect(handler.enabled([])).toBe(false)
	})
})
