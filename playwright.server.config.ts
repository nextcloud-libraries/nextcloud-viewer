/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineConfig, devices } from '@playwright/test'

/**
 * The suite that runs against a real Nextcloud.
 *
 * Kept apart from the playground suite on purpose. That one needs no
 * docker and finishes in twenty seconds, which is what makes it the one
 * to work in; this one starts a container and is the only place the
 * preview-backed formats can be tested at all.
 */
export default defineConfig({
	testDir: './e2e-server/tests',
	globalSetup: './e2e-server/global-setup.ts',
	// A single server behind them, so they are not free to race each other
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'blob' : 'list',
	// Container startup is minutes, and a cold preview render is seconds
	timeout: 60_000,
	use: {
		baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost',
		trace: 'on-first-retry',
		reducedMotion: 'reduce',
		ignoreHTTPSErrors: true,
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
})
