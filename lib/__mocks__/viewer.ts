/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { vi } from 'vitest'

// Shared manual mock for the viewer singleton. Enable per spec with
// `vi.mock('../../src/api_package/viewer.ts')`, then import `viewer` to assert.
export const viewer = {
	// Async, as the real ones are: a caller chains on what they return
	open: vi.fn(async () => {}),
	openFolder: vi.fn(async () => {}),
	compare: vi.fn(async () => {}),
	goTo: vi.fn(),
	close: vi.fn(),
	setEditing: vi.fn(),
}

export function getViewer() {
	return viewer
}
