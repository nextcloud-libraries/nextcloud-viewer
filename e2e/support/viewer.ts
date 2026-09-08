/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { Locator, Page } from '@playwright/test'

import { expect } from '@playwright/test'

/**
 * The viewer modal, as the playground drives it.
 *
 * The same surface the server's own specs use, so a spec can move between
 * the two without being rewritten.
 */
export class ViewerPage {
	public readonly container: Locator
	public readonly loading: Locator
	public readonly headerName: Locator
	public readonly nextButton: Locator
	public readonly previousButton: Locator
	public readonly closeButton: Locator

	constructor(public readonly page: Page) {
		// NcModal teleports to the body, so match it by class rather than
		// looking under the mount point
		this.container = page.locator('.viewer__modal')
		this.loading = this.container.locator('.viewer__loading')
		this.headerName = this.container.locator('.modal-header__name')
		this.nextButton = this.container.getByRole('button', { name: 'Next' })
		this.previousButton = this.container.getByRole('button', { name: 'Previous' })
		this.closeButton = this.container.getByRole('button', { name: 'Close' })
	}

	/**
	 * Open the playground and click one of its files.
	 *
	 * @param name the file to open
	 */
	async open(name: string): Promise<void> {
		await this.page.goto('/')
		await this.page.getByRole('button', { name }).click()
	}

	/** Wait until the viewer is showing something rather than loading it. */
	async waitForOpen(): Promise<void> {
		await expect(this.container).toBeVisible()
		await expect(this.loading).toHaveCount(0)
	}

	/** The name of the file currently shown, from the header. */
	async currentName(): Promise<string> {
		return (await this.headerName.textContent())?.trim() ?? ''
	}

	async next(): Promise<void> {
		await this.nextButton.click()
	}

	async previous(): Promise<void> {
		await this.previousButton.click()
	}
}
