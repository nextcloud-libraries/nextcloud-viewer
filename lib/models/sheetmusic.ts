/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import MusicClefTrebleSvg from '@mdi/svg/svg/music-clef-treble.svg?raw'
import { defineCustomElement } from 'vue'
import { registerHandler } from '../handlers.ts'
import { logger } from '../services/logger.ts'
import { defineCustomElementOnce } from '../utils/customElements.ts'
import { t } from '../utils/l10n.ts'

/**
 * What a score is stored as.
 *
 * `.musicxml` is the score as XML and `.mxl` is that same XML zipped, which
 * is why one of these is not an `+xml` type. Nothing else is claimed here:
 * an earlier attempt at this registered `application/octet-stream` too,
 * because the extensions had no mapping at the time and a score arrived as
 * an unknown binary. They map since server 32, and claiming the type every
 * unrecognised file falls back to would have handed this handler far more
 * than sheet music.
 */
const supportedMimes = [
	'application/vnd.recordare.musicxml',
	'application/vnd.recordare.musicxml+xml',
]

export const tagname = 'oca-viewer-sheetmusic'

/**
 * Register the sheet music custom element.
 */
export async function registerSheetmusicCustomElement(): Promise<void> {
	const { default: Sheetmusic } = await import('../components/Sheetmusic.vue')
	const SheetmusicElement = defineCustomElement(Sheetmusic, {
		shadowRoot: false,
	})

	defineCustomElementOnce(tagname, SheetmusicElement)
}

/**
 * Register the sheet music handler.
 */
export function registerSheetmusicHandler() {
	registerHandler({
		id: 'sheetmusic',
		displayName: t('Sheet music'),
		tagname,

		iconSvgInline: MusicClefTrebleSvg,

		enabled: (nodes) => {
			if (nodes.length === 0) {
				return false
			}

			return nodes.every((node) => supportedMimes.includes(node.mime))
		},
	})
	logger.info('Sheet music handler registered', { tagname })
}
