/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHandlers } from '../lib/index.ts'
import { makeFile } from './factories.ts'

const { capabilities } = vi.hoisted(() => ({ capabilities: { value: {} as object } }))
vi.mock('@nextcloud/capabilities', () => ({ getCapabilities: () => capabilities.value }))

/**
 * Register the image handler against the given set of enabled preview providers.
 *
 * @param providers - The provider mime patterns the server would report
 */
async function registerWithProviders(providers?: string[]) {
	capabilities.value = providers === undefined ? {} : { core: { previews: { enabled_providers: providers } } }
	vi.resetModules()
	const { registerImageHandler } = await import('../lib/models/images.ts')
	registerImageHandler()
	return getHandlers().get('images')!
}

describe('preview providers', () => {
	beforeEach(() => {
		capabilities.value = {}
	})

	it('enables a preview-only mime the server has a provider for', async () => {
		const handler = await registerWithProviders(['/image\\/hei(f|c)/'])

		expect(handler.enabled([makeFile({ mime: 'image/heic' })])).toBe(true)
	})

	it('leaves a preview-only mime alone when its provider is disabled', async () => {
		const handler = await registerWithProviders(['/image\\/jpeg/'])

		expect(handler.enabled([makeFile({ mime: 'image/heic' })])).toBe(false)
	})

	it('opens a JPEG 2000 where the server renders one', async () => {
		// Nothing decodes this in the browser, so the server having a
		// provider for it is the whole of the support
		const handler = await registerWithProviders(['/image\\/jp2/'])

		expect(handler.enabled([makeFile({ mime: 'image/jp2' })])).toBe(true)
	})

	it('leaves a JPEG 2000 alone on a server that cannot render one', async () => {
		// Which is every server until an admin enables the provider, so
		// offering it would open a file that can only come up empty
		const handler = await registerWithProviders(['/image\\/jpeg/'])

		expect(handler.enabled([makeFile({ mime: 'image/jp2' })])).toBe(false)
	})

	it('falls back to the browser mimes when the capability is missing', async () => {
		const handler = await registerWithProviders(undefined)

		expect(handler.enabled([makeFile({ mime: 'image/heic' })])).toBe(false)
		expect(handler.enabled([makeFile({ mime: 'image/png' })])).toBe(true)
	})
})
