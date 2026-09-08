/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { UserConfig } from 'vitest/node'
import config from './vite.config.ts'

export default async (env) => {
	return {
		...await config(env),
		test: {
			environment: 'jsdom',
			// The build externalizes @nextcloud/*, so vitest would hand its
			// components' CSS imports straight to node. Inline them instead.
			server: {
				deps: {
					inline: [/@nextcloud\/vue/, /@nextcloud\/dialogs/],
				},
			},
			setupFiles: ['./__tests__/setup.ts'],
			// Playwright specs in e2e/ have their own runner
			include: ['__tests__/**/*.spec.ts'],
			coverage: {
				include: ['lib/**'],
				// Translation bootstrap has no testable logic
				exclude: ['lib/utils/l10n.ts'],
				reporter: ['lcov', 'text'],
			},
		} as UserConfig,
	}
}
