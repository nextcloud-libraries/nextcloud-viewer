/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it } from 'vitest'
import { emittedValue, toError } from '../lib/utils/handlerEvents.ts'

describe('emittedValue', () => {
	it('reads the first argument a custom element carried', () => {
		expect(emittedValue(new CustomEvent('errored', { detail: [new Error('boom')] }))).toBeInstanceOf(Error)
		expect(emittedValue<boolean>(new CustomEvent('update:canSwipe', { detail: [false] }))).toBe(false)
	})

	it('reads a detail that is not an array', () => {
		expect(emittedValue<string>(new CustomEvent('errored', { detail: 'boom' }))).toBe('boom')
	})

	it('is undefined for an event carrying nothing', () => {
		expect(emittedValue(new Event('loaded'))).toBeUndefined()
		expect(emittedValue(new CustomEvent('loaded'))).toBeUndefined()
	})

	it('passes through what a component emitted directly', () => {
		// How the built-in handlers emit when mounted as components rather
		// than through their custom element
		const error = new Error('boom')
		expect(emittedValue(error)).toBe(error)
		expect(emittedValue<boolean>(false)).toBe(false)
	})
})

describe('toError', () => {
	it('keeps an Error that has something to say', () => {
		const error = new Error('disk on fire')
		expect(toError(error, 'fallback')).toBe(error)
	})

	it.each([
		['an Error with no message', new Error('')],
		['nothing', undefined],
		['null', null],
		['an empty string', '   '],
		['an object that is not an Error', { code: 500 }],
		['a number', 42],
	])('falls back for %s', (_name, reported) => {
		expect(toError(reported, 'fallback').message).toBe('fallback')
	})

	it('takes a string as the message, since handlers do that', () => {
		expect(toError('disk on fire', 'fallback').message).toBe('disk on fire')
	})
})
