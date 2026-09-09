/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Read the value a handler emitted.
 *
 * Handlers are custom elements, so `emit('errored', error)` reaches the viewer
 * as a `CustomEvent` whose `detail` holds the arguments the handler passed.
 * A component mounted directly, which is how the built-in handlers are unit
 * tested, emits the value itself. Both have to work.
 *
 * @param event - Whatever the listener was handed
 */
export function emittedValue<T>(event: unknown): T | undefined {
	if (typeof CustomEvent !== 'undefined' && event instanceof CustomEvent) {
		const { detail } = event
		// A CustomEvent with nothing attached reports null rather than undefined
		const value = Array.isArray(detail) ? detail[0] : detail
		return (value ?? undefined) as T | undefined
	}

	if (typeof Event !== 'undefined' && event instanceof Event) {
		// An event with nothing attached: the handler emitted no value
		return undefined
	}

	return event as T
}

/**
 * Turn whatever a handler reported as an error into one.
 *
 * `ViewerEmits` asks for an `Error`, but a handler is someone else's code: it
 * may pass a string, an object from a rejected request, or nothing at all.
 *
 * @param reported - What the handler emitted with its `errored` event
 * @param fallback - Message to use when the handler gave nothing usable
 */
export function toError(reported: unknown, fallback: string): Error {
	if (reported instanceof Error) {
		return reported.message ? reported : new Error(fallback)
	}

	if (typeof reported === 'string' && reported.trim() !== '') {
		return new Error(reported)
	}

	return new Error(fallback)
}
