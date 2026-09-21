/**
 * SPDX-FileCopyrightText: 2019 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import AudioOutlineSvg from '@mdi/svg/svg/music-note-outline.svg?raw'
import { defineCustomElement } from 'vue'
import { registerHandler } from '../handlers.ts'
import { logger } from '../services/logger.ts'
import { defineCustomElementOnce } from '../utils/customElements.ts'
import { t } from '../utils/l10n.ts'

export const browserSupportedMimes = [
	'audio/aac',
	'audio/aacp',
	'audio/flac',
	'audio/mp4',
	'audio/mpeg',
	'audio/ogg',
	'audio/vorbis',
	// The same RIFF/WAVE container under all three of its names: the one in
	// common use, the registered one (RFC 2361) that mail clients send, and the
	// historic x- form. What plays is decided by the bytes, not by the name.
	'audio/vnd.wave',
	'audio/wav',
	'audio/webm',
	'audio/x-wav',
]

export const tagname = 'oca-viewer-audio'

/**
 * Register the audio custom element.
 */
export async function registerAudioCustomElement(): Promise<void> {
	const { default: Audios } = await import('../components/Audios.vue')
	const AudioElement = defineCustomElement(Audios, {
		shadowRoot: false,
	})

	defineCustomElementOnce(tagname, AudioElement)
}

/**
 * Register the audio handler.
 */
export function registerAudioHandler() {
	registerHandler({
		id: 'audios',
		displayName: t('Audio player'),
		tagname,
		supportsEndToEndEncryption: true,

		iconSvgInline: AudioOutlineSvg,

		group: 'media',

		enabled: (nodes) => {
			if (nodes.length === 0) {
				return false
			}

			return nodes.every((node) => {
				// Always allow browser supported mimes
				if (browserSupportedMimes.includes(node.mime)) {
					return true
				}

				return false
			})
		},
	})
	logger.info('Audio handler registered', { tagname })
}
