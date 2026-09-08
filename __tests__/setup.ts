/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeEach, vi } from 'vitest'
import { scope } from '../lib/scope.ts'

// Ambient Nextcloud globals referenced by some components without importing them.
// Only set them when missing so the server's own test globals are never clobbered.
type NcGlobal = typeof globalThis & {
	t?: (app: string, text: string) => string
	n?: (app: string, singular: string, plural: string, count: number) => string
	OCA?: { Files?: Record<string, unknown> }
}

// jsdom implements neither of these, and the viewer uses both: object URLs
// for edited images, and ResizeObserver on mount.
URL.createObjectURL ??= () => 'blob:test'
URL.revokeObjectURL ??= () => {}

globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
}

const g = globalThis as NcGlobal
g.t ??= (_app: string, text: string) => text
g.n ??= (_app: string, singular: string, plural: string, count: number) => (count === 1 ? singular : plural)
g.OCA ??= {}
g.OCA.Files ??= {}

// Reset the viewer handler registry between tests so registrations never leak,
// and clear mock call history (shared manual mocks keep their implementation).
beforeEach(() => {
	vi.clearAllMocks()
	// Reset the shared scope so registrations, the elected implementation
	// and the mounted viewer never leak between tests
	scope.handlers = new Map()
	scope.service = undefined
	scope.candidates.length = 0
	scope.implementation = undefined
})
