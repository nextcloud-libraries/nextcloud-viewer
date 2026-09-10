/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compareVersions, loadImplementation, registerImplementation, scope } from '../lib/scope.ts'
import { logger } from '../lib/services/logger.ts'

describe('compareVersions', () => {
	it('orders by each part in turn', () => {
		expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
		expect(compareVersions('2.1.0', '2.0.9')).toBeGreaterThan(0)
		expect(compareVersions('2.0.10', '2.0.9')).toBeGreaterThan(0)
	})

	it('treats equal versions as equal', () => {
		expect(compareVersions('2.0.0', '2.0.0')).toBe(0)
		expect(compareVersions('2.0.0-beta.1', '2.0.0-beta.1')).toBe(0)
	})

	it('ranks a release above its own prereleases', () => {
		expect(compareVersions('2.0.0', '2.0.0-beta.1')).toBeGreaterThan(0)
	})

	it('compares prerelease identifiers the way semver does', () => {
		// Numeric identifiers compare as numbers, not as text
		expect(compareVersions('2.0.0-beta.2', '2.0.0-beta.10')).toBeLessThan(0)
		// A numeric identifier ranks below an alphanumeric one
		expect(compareVersions('2.0.0-1', '2.0.0-alpha')).toBeLessThan(0)
		// A shorter run of identifiers ranks first
		expect(compareVersions('2.0.0-beta', '2.0.0-beta.1')).toBeLessThan(0)
	})

	it('ranks a prerelease above the release it supersedes', () => {
		// 2.0.0-beta.1 is still newer than 1.9.9, whatever the tag says
		expect(compareVersions('2.0.0-beta.1', '1.9.9')).toBeGreaterThan(0)
	})
})

describe('electing an implementation', () => {
	beforeEach(() => {
		scope.candidates.length = 0
		scope.implementation = undefined
	})

	it('loads the newest candidate, whatever order they registered in', async () => {
		const loaded: string[] = []
		registerImplementation({ version: '2.1.0', load: async () => void loaded.push('2.1.0') })
		registerImplementation({ version: '3.0.0', load: async () => void loaded.push('3.0.0') })
		registerImplementation({ version: '2.0.0', load: async () => void loaded.push('2.0.0') })

		await loadImplementation()
		// The losers never load: that is what keeps the page paying for one viewer
		expect(loaded).toEqual(['3.0.0'])
	})

	it('loads the highest of several copies of one major, once', async () => {
		const loaded: string[] = []
		registerImplementation({ version: '2.1.0', load: async () => void loaded.push('2.1.0') })
		registerImplementation({ version: '2.2.0', load: async () => void loaded.push('2.2.0') })

		await loadImplementation()
		// Two apps on one major share a viewer rather than mounting two
		expect(loaded).toEqual(['2.2.0'])
	})

	it('loads once however many callers ask', async () => {
		const load = vi.fn().mockResolvedValue(undefined)
		registerImplementation({ version: '2.0.0', load })

		await Promise.all([loadImplementation(), loadImplementation(), loadImplementation()])
		expect(load).toHaveBeenCalledTimes(1)
	})

	it('refuses when nothing offered an implementation', async () => {
		await expect(loadImplementation()).rejects.toThrow('No viewer implementation')
	})

	// A chunk missed once, on a deploy or a lost connection, must not be the
	// answer for the rest of the page's life
	it('tries again after a load that failed', async () => {
		const load = vi.fn()
			.mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
			.mockResolvedValueOnce(undefined)
		registerImplementation({ version: '2.0.0', load })

		await expect(loadImplementation()).rejects.toThrow('Failed to fetch')
		await expect(loadImplementation()).resolves.toBeUndefined()
		expect(load).toHaveBeenCalledTimes(2)
	})

	it('warns when incompatible majors share the page, naming the one that wins', () => {
		const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
		registerImplementation({ version: '2.0.0', load: async () => {} })
		expect(warn).not.toHaveBeenCalled()

		registerImplementation({ version: '3.1.0', load: async () => {} })
		expect(warn).toHaveBeenCalledOnce()
		expect(warn.mock.calls[0]![0]).toContain('2.0.0, 3.1.0')
		expect(warn.mock.calls[0]![0]).toContain('Only 3.1.0 will be used')
	})

	it('stays quiet within a major, where the newest simply wins', () => {
		const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
		registerImplementation({ version: '2.0.0', load: async () => {} })
		registerImplementation({ version: '2.3.0', load: async () => {} })
		registerImplementation({ version: '2.0.0', load: async () => {} })
		expect(warn).not.toHaveBeenCalled()
	})

	it('does not warn for a release beside its own prerelease', () => {
		const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
		registerImplementation({ version: '2.0.0-beta.1', load: async () => {} })
		registerImplementation({ version: '2.0.0', load: async () => {} })
		expect(warn).not.toHaveBeenCalled()
	})
})
