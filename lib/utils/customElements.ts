/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
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
