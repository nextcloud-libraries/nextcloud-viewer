/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFile } from '@nextcloud/files'
import type { EffectScope, Ref } from 'vue'

import { Permission } from '@nextcloud/files'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { makeFile } from './factories.ts'

const axiosGet = vi.hoisted(() => vi.fn())
const axiosPut = vi.hoisted(() => vi.fn())
vi.mock('@nextcloud/axios', () => ({ default: { get: axiosGet, put: axiosPut } }))
vi.mock('@nextcloud/event-bus')
vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn(), showSuccess: vi.fn() }))

// The byte work is the editor package's and is tested there. What matters
// here is the orchestration around it: when a turn is written, which file
// it is written to, and what is sent with it. The stub composes turns the
// way the real one does so the count can be asserted.
const setOrientation = vi.hoisted(() => vi.fn<(bytes: Uint8Array<ArrayBuffer>, orientation: number) => Uint8Array<ArrayBuffer> | null>(() => new Uint8Array([0xFF, 0xD8, 0x99])))
vi.mock('@nextcloud/image-editor/jpeg', () => ({
	readJpegOrientation: () => 1,
	// Honours the direction, so a composable that turned the picture the
	// wrong way is visible here rather than only in an end-to-end run
	rotateOrientation: (orientation: number, turn: 'left' | 'right') => (
		turn === 'left' ? orientation + 1 : orientation - 1
	),
	setJpegOrientation: setOrientation,
}))

const { showError } = await import('@nextcloud/dialogs')
const { emit: emitBus } = await import('@nextcloud/event-bus')
const { useRotation } = await import('../lib/composables/useRotation.ts')

/** How long the composable waits before writing, plus a margin */
const AFTER_QUIET = 1300

describe('useRotation', () => {
	let scope: EffectScope
	let file: Ref<IFile | undefined>
	let rotation: ReturnType<typeof useRotation>

	/**
	 * Run the composable over a file, in a scope the test can dispose.
	 *
	 * @param node the file on screen
	 */
	function start(node?: IFile) {
		file = ref(node)
		scope = effectScope()
		rotation = scope.run(() => useRotation(file))!
	}

	beforeEach(() => {
		vi.useFakeTimers()
		axiosGet.mockReset()
		axiosPut.mockReset()
		setOrientation.mockClear()
		vi.mocked(showError).mockClear()
		vi.mocked(emitBus).mockClear()
		axiosGet.mockResolvedValue({ data: new Uint8Array([0xFF, 0xD8, 0x00]).buffer })
		axiosPut.mockResolvedValue({ headers: { 'oc-etag': '"written"' } })
	})

	afterEach(() => {
		scope?.stop()
		vi.useRealTimers()
	})

	/** Let the debounce fire and the write run to completion */
	async function settle() {
		await vi.advanceTimersByTimeAsync(AFTER_QUIET)
		await flushPromises()
	}

	describe('what it offers', () => {
		it('offers a turn on a JPEG the user may write', () => {
			start(makeFile({ mime: 'image/jpeg' }))
			expect(rotation.canRotate.value).toBe(true)
		})

		it('refuses a JPEG the user may only read', () => {
			// The turn would be shown and then fail on save, which is worse
			// than not offering it
			start(makeFile({ mime: 'image/jpeg', permissions: Permission.READ }))
			expect(rotation.canRotate.value).toBe(false)
		})

		it('refuses a format that cannot keep the turn', () => {
			for (const mime of ['image/png', 'image/webp', 'image/gif']) {
				start(makeFile({ mime }))
				expect(rotation.canRotate.value).toBe(false)
			}
		})

		it('refuses when there is no file at all', () => {
			start(undefined)
			expect(rotation.canRotate.value).toBe(false)
		})
	})

	describe('what it shows', () => {
		it('turns the picture before anything is written', () => {
			start(makeFile())
			rotation.rotateLeft()
			expect(rotation.turns.value).toBe(1)
			expect(axiosPut).not.toHaveBeenCalled()
		})

		it('comes back round to square after four turns', () => {
			start(makeFile())
			for (let i = 0; i < 4; i++) {
				rotation.rotateLeft()
			}
			expect(rotation.turns.value).toBe(0)
		})

		it('does not turn a picture it would not offer to turn', () => {
			start(makeFile({ mime: 'image/png' }))
			rotation.rotateLeft()
			expect(rotation.turns.value).toBe(0)
		})
	})

	describe('what it writes', () => {
		it('writes once for a run of turns rather than once each', async () => {
			start(makeFile())
			rotation.rotateLeft()
			rotation.rotateLeft()
			await settle()

			// Every write makes a version of the file, so a turn per click
			// would leave a trail of them
			expect(axiosPut).toHaveBeenCalledTimes(1)
			// Two turns composed, not one
			expect(setOrientation).toHaveBeenCalledWith(expect.anything(), 3)
		})

		it('writes nothing for a picture turned the whole way round', async () => {
			start(makeFile())
			for (let i = 0; i < 4; i++) {
				rotation.rotateLeft()
			}
			await settle()

			// The file is as it was, and a version of a file that did not
			// change is worse than no version
			expect(axiosGet).not.toHaveBeenCalled()
			expect(axiosPut).not.toHaveBeenCalled()
		})

		it('turns the picture the way the button says', async () => {
			// Two quarters anticlockwise from 1, as the stubbed composition
			// counts them. A composable that asked for 'right' would arrive
			// at a different number and nothing else here would notice
			start(makeFile())
			rotation.rotateLeft()
			rotation.rotateLeft()
			await settle()

			expect(setOrientation).toHaveBeenCalledWith(expect.anything(), 3)
		})

		it('says while it is writing, and stops saying so', async () => {
			// The request is held open, because advancing the timers also
			// drains the promises and the write would otherwise be over
			// before there is anything to observe
			const { promise, resolve } = Promise.withResolvers<unknown>()
			axiosGet.mockReturnValueOnce(promise)

			start(makeFile())
			expect(rotation.saving.value).toBe(false)

			rotation.rotateLeft()
			await vi.advanceTimersByTimeAsync(AFTER_QUIET)
			expect(rotation.saving.value).toBe(true)

			resolve({ data: new Uint8Array([0xFF, 0xD8, 0x00]).buffer })
			await flushPromises()
			expect(rotation.saving.value).toBe(false)
		})

		it('stops saying it is writing after a failure too', async () => {
			axiosPut.mockRejectedValue(new Error('nope'))
			start(makeFile())
			rotation.rotateLeft()
			await settle()

			expect(rotation.saving.value).toBe(false)
		})

		it('unquotes an etag however the server quoted it', async () => {
			// A dav etag comes back quoted, and which quoting depends on who
			// wrote it: a literal quote or the escaped entity
			start(makeFile({ attributes: { etag: '&quot;opened-as&quot;' } }))
			rotation.rotateLeft()
			await settle()

			expect(axiosPut.mock.calls[0]![2].headers).toEqual({ 'If-Match': '"opened-as"' })
		})

		it('sends the bytes back as a JPEG', async () => {
			start(makeFile())
			rotation.rotateLeft()
			await settle()

			const [, body] = axiosPut.mock.calls[0]!
			expect(body).toBeInstanceOf(Blob)
			expect((body as Blob).type).toBe('image/jpeg')
		})

		it('guards the write against a change made elsewhere', async () => {
			start(makeFile({ attributes: { etag: 'opened-as' } }))
			rotation.rotateLeft()
			await settle()

			expect(axiosPut.mock.calls[0]![2].headers).toEqual({ 'If-Match': '"opened-as"' })
		})

		it('guards a second turn against the version it just wrote', async () => {
			// The file's own etag is stale the moment the first write lands,
			// and reusing it would fail the second write
			start(makeFile({ attributes: { etag: 'opened-as' } }))
			rotation.rotateLeft()
			await settle()
			rotation.rotateLeft()
			await settle()

			expect(axiosPut.mock.calls[1]![2].headers).toEqual({ 'If-Match': '"written"' })
		})

		it('tells the rest of the app the file changed', async () => {
			start(makeFile())
			rotation.rotateLeft()
			await settle()

			expect(emitBus).toHaveBeenCalledWith('files:node:updated', expect.anything())
		})

		it('hands the written file over before announcing it', async () => {
			// The viewer marks the update as its own here, or it reloads the
			// picture it already shows turned, and the picture flashes
			const onWritten = vi.fn(() => expect(emitBus).not.toHaveBeenCalled())
			const node = makeFile()
			file = ref(node)
			scope = effectScope()
			rotation = scope.run(() => useRotation(file, onWritten))!
			rotation.rotateLeft()
			await settle()

			expect(onWritten).toHaveBeenCalledWith(node)
			expect(emitBus).toHaveBeenCalledOnce()
		})

		it('hands nothing over when the write fails', async () => {
			axiosPut.mockRejectedValue(new Error('nope'))
			const onWritten = vi.fn()
			file = ref(makeFile())
			scope = effectScope()
			rotation = scope.run(() => useRotation(file, onWritten))!
			rotation.rotateLeft()
			await settle()

			expect(onWritten).not.toHaveBeenCalled()
			expect(emitBus).not.toHaveBeenCalled()
		})

		it('builds a second turn on the bytes it wrote, not on a fresh read', async () => {
			// A read can be answered before the previous write lands, and a
			// turn computed from it writes the old orientation back
			const first = new Uint8Array([0xFF, 0xD8, 0x01])
			setOrientation.mockReturnValueOnce(first)
			start(makeFile())
			rotation.rotateLeft()
			await settle()
			rotation.rotateLeft()
			await settle()

			expect(axiosGet).toHaveBeenCalledTimes(1)
			expect(setOrientation.mock.calls[1]![0]).toBe(first)
		})

		it('reads the file again once it has moved on to another', async () => {
			start(makeFile({ basename: 'first.jpg' }))
			rotation.rotateLeft()
			await settle()
			file.value = makeFile({ basename: 'second.jpg' })
			rotation.rotateLeft()
			await settle()

			expect(axiosGet).toHaveBeenCalledTimes(2)
			expect(axiosGet.mock.calls[1]![0]).toContain('second.jpg')
		})

		it('holds a turn made during a write until that write lands', async () => {
			// Two writes racing each other each start from the file as it was,
			// so the second undoes the first, or fails on the stale etag
			const { promise, resolve } = Promise.withResolvers<unknown>()
			axiosPut.mockReturnValueOnce(promise)
			start(makeFile({ attributes: { etag: 'opened-as' } }))
			rotation.rotateLeft()
			await settle()
			rotation.rotateLeft()
			await settle()

			expect(axiosPut).toHaveBeenCalledTimes(1)
			expect(rotation.saving.value).toBe(true)

			resolve({ headers: { 'oc-etag': '"written"' } })
			await flushPromises()

			expect(axiosPut).toHaveBeenCalledTimes(2)
			expect(axiosPut.mock.calls[1]![2].headers).toEqual({ 'If-Match': '"written"' })
			expect(axiosGet).toHaveBeenCalledTimes(1)
			expect(rotation.saving.value).toBe(false)
		})

		it('leaves the preview where it is, so the turn on screen holds', async () => {
			// The preview URL carries the etag: moving it reloads the element
			// to a freshly turned preview while the turn is still shown on top
			const node = makeFile({ attributes: { etag: 'opened-as' } })
			start(node)
			rotation.rotateLeft()
			await settle()

			expect(node.attributes.etag).toBe('opened-as')
			expect(rotation.turns.value).toBe(1)
		})
	})

	describe('moving on', () => {
		it('writes what is owed on the file being left', async () => {
			const first = makeFile({ basename: 'first.jpg' })
			start(first)
			rotation.rotateLeft()

			file.value = makeFile({ basename: 'second.jpg' })
			await nextTick()
			await flushPromises()

			expect(axiosPut).toHaveBeenCalledTimes(1)
			expect(axiosGet.mock.calls[0]![0]).toContain('first.jpg')
		})

		it('starts the next file square', async () => {
			start(makeFile({ basename: 'first.jpg' }))
			rotation.rotateLeft()

			file.value = makeFile({ basename: 'second.jpg' })
			await nextTick()

			expect(rotation.turns.value).toBe(0)
		})

		it('writes what is owed when the viewer closes', async () => {
			start(makeFile())
			rotation.rotateLeft()

			scope.stop()
			await flushPromises()

			expect(axiosPut).toHaveBeenCalledTimes(1)
		})
	})

	describe('when it cannot', () => {
		it('says so rather than leaving the turn looking saved', async () => {
			axiosPut.mockRejectedValue(new Error('nope'))
			start(makeFile())
			rotation.rotateLeft()
			await settle()

			expect(showError).toHaveBeenCalled()
		})

		it('names the case where someone else got there first', async () => {
			axiosPut.mockRejectedValue({ response: { status: 412 } })
			start(makeFile())
			rotation.rotateLeft()
			await settle()

			expect(vi.mocked(showError).mock.calls[0]![0]).toContain('changed elsewhere')
		})

		it('writes nothing when the tag cannot be put into the file', async () => {
			setOrientation.mockReturnValueOnce(null)
			start(makeFile())
			rotation.rotateLeft()
			await settle()

			expect(axiosPut).not.toHaveBeenCalled()
			expect(showError).toHaveBeenCalled()
		})
	})
})
