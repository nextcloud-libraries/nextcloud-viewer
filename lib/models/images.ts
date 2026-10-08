/**
 * SPDX-FileCopyrightText: 2019 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getCapabilities } from '@nextcloud/capabilities'
import { defineCustomElement } from 'vue'
import { registerHandler } from '../handlers.ts'
import { logger } from '../services/logger.ts'
import { defineCustomElementOnce } from '../utils/customElements.ts'
import { t } from '../utils/l10n.ts'

interface PreviewCapabilities {
	core?: {
		previews?: {
			enabled_providers?: string[]
		}
	}
}

const enabledPreviewProviders = (getCapabilities() as PreviewCapabilities).core?.previews?.enabled_providers ?? []

/**
 * Those mimes needs a proper preview to be displayed
 * if they are not enabled on the server, let's not activate them.
 */
export const previewSupportedMimes = [
	'image/heic',
	'image/heif',
	// No browser decodes JPEG 2000, and libgd cannot either, so this one
	// depends entirely on the server rendering it. Filtered out below
	// wherever no provider is enabled for it, as tiff already is.
	'image/jp2',
	'image/tiff',
	'image/x-xbitmap',
	'image/emf',
]

/**
 * Those mimes are always supported by the browser
 * Since we fallback to the source image if there is no
 * preview, we can always include them.
 */
export const browserSupportedMimes = [
	'image/apng',
	// Decoded natively by every engine the viewer runs in, so it needs no
	// preview: there is no provider for it either, and waiting for one
	// would keep it unopenable on servers that will never have it
	'image/avif',
	'image/bmp',
	'image/gif',
	'image/jpeg',
	'image/png',
	'image/svg+xml',
	'image/webp',
	'image/x-icon',
]

/**
 * The mimes that need a preview, minus the ones this server will not
 * generate one for: offering those would open a file that cannot be shown.
 */
function filterEnabledMimes() {
	return previewSupportedMimes.filter((filter) => {
		return enabledPreviewProviders.findIndex((mimeRegex) => {
			// Remove leading and trailing slash from string regex
			const regex = new RegExp(mimeRegex.replace(/^\/|\/$/g, ''), 'i')
			return filter.match(regex)
		}) > -1
	})
}

const enabledMimes = filterEnabledMimes()
const ignoredMimes = previewSupportedMimes.filter((x) => !enabledMimes.includes(x))
if (ignoredMimes.length > 0) {
	logger.warn('Some mimes were ignored because they are not enabled in the server previews config', { ignoredMimes })
}

export const tagName = 'oca-viewer-image'

/**
 * Define the custom element the image handler names.
 */
export async function registerImageCustomElement(): Promise<void> {
	const { default: Images } = await import('../components/Images.vue')
	const ImageElement = defineCustomElement(Images, {
		shadowRoot: false,
	})

	defineCustomElementOnce(tagName, ImageElement)
}

/**
 * Register the image handler.
 */
export function registerImageHandler() {
	registerHandler({
		id: 'images',
		displayName: t('Images'),
		tagName,
		// With video and audio: a folder of photos and films pages through
		// all of them, and a video finds the poster beside it in its list
		group: 'media',
		supportsEndToEndEncryption: true,
		canEdit: true,
		// Side by side is how two versions of a picture show what changed
		canCompare: () => true,
		// Or one over the other, with a slider
		canShowDifferences: () => true,
		// Shown at once when the user steps to it, as the old viewer had it
		preload: async (node, space) => {
			const { preloadNeighbourPreview } = await import('../utils/neighbours.ts')
			await preloadNeighbourPreview(node, space)
		},

		enabled: (nodes) => {
			if (nodes.length === 0) {
				return false
			}

			return nodes.every((node) => {
				// Always allow browser supported mimes
				if (browserSupportedMimes.includes(node.mime)) {
					return true
				}

				// Only allow preview supported mimes if they are enabled in the server config
				if (enabledMimes.includes(node.mime)) {
					return true
				}
				return false
			})
		},
	})
	logger.info('Image handler registered', { tagName, enabledMimes, browserSupportedMimes })
}
