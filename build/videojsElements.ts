/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { Api } from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'

/**
 * Whether a tag of the media skins is a Video.js element rather than a
 * Vue component to resolve. Our own components are all PascalCase, so the
 * `media-` prefix cannot hide a misspelled one.
 *
 * @param tag - The tag as written in a template
 */
export function isVideojsElement(tag: string): boolean {
	return tag.startsWith('media-') || tag === 'video-player' || tag === 'audio-player'
}

/**
 * Teach the Vue plugin `@nextcloud/vite-config` sets up about the Video.js
 * elements. It takes no compiler options of its own, but the plugin's
 * options can be changed once the config is resolved, before any template
 * is compiled.
 */
export const videojsElements: Plugin = {
	name: 'viewer:videojs-elements',
	configResolved(config) {
		const vue = config.plugins.find((plugin) => plugin.name === 'vite:vue') as (Plugin & { api: Api }) | undefined
		if (!vue) {
			throw new Error('The Vue plugin is missing, the Video.js elements cannot be declared')
		}
		const { options } = vue.api
		vue.api.options = {
			...options,
			template: {
				...options.template,
				compilerOptions: {
					...options.template?.compilerOptions,
					isCustomElement: isVideojsElement,
				},
			},
		}
	},
}
