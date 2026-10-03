/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IHandler } from '../handlers.ts'

import { logger } from '../services/logger.ts'

/**
 * Define a custom element, unless that name is taken.
 *
 * `define()` throws on a name the registry already knows, and the viewer is
 * not alone on the page: another copy of the library, of a generation that
 * keeps its own registry, names the same elements. Whichever mounts second
 * would throw here and never finish mounting.
 *
 * @param tagName - The custom element name to define
 * @param constructor - The element to define it as
 */
export function defineCustomElementOnce(tagName: string, constructor: CustomElementConstructor): void {
	if (window.customElements.get(tagName) !== undefined) {
		logger.debug(`The custom element ${tagName} is already defined, leaving it alone`, { tagName })
		return
	}

	window.customElements.define(tagName, constructor)
}

/** The handlers being initialized, by tag, so each one is initialized once however often it is asked for */
const initializing = new Map<string, Promise<void>>()

/**
 * Make sure a handler's element is defined, initializing the handler first if it has to.
 *
 * Resolves at once for an element that is defined already, or for a
 * handler without `onInit()`, which defines its element itself. An
 * `onInit()` that fails is forgotten, so the next open tries again.
 *
 * @param handler - The handler whose element is about to be rendered
 */
export function initHandlerElement(handler: IHandler): Promise<void> {
	if (handler.onInit === undefined || window.customElements.get(handler.tagName) !== undefined) {
		return Promise.resolve()
	}

	let pending = initializing.get(handler.tagName)
	if (pending === undefined) {
		pending = handler.onInit().then(() => window.customElements.whenDefined(handler.tagName)).then(() => undefined)
		initializing.set(handler.tagName, pending)
		pending.catch(() => initializing.delete(handler.tagName))
	}
	return pending
}
