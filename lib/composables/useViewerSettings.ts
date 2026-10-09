/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import axios from '@nextcloud/axios'
import { showError } from '@nextcloud/dialogs'
import { loadState } from '@nextcloud/initial-state'
import { generateOcsUrl } from '@nextcloud/router'
import { reactive, readonly, toRef } from 'vue'
import { logger } from '../services/logger.ts'
import { t } from '../utils/l10n.ts'

/** What the server hands the page, for a logged-in user only */
interface StoredConfig {
	/** Seconds the slideshow shows each file for */
	slideshow_delay: number
	/** Volume of videos and audio, in percent */
	volume: number
	/** Whether videos and audio start muted */
	muted: boolean
}

/** The settings of a user who never changed them, as the server has them */
export const DEFAULT_CONFIG: Readonly<StoredConfig> = {
	slideshow_delay: 5,
	volume: 100,
	muted: false,
}

// No settings for a guest, or from a server that keeps none: they are then
// only kept until the page is left
const stored = loadState<StoredConfig | null>('viewer', 'config', null)
const config = reactive<StoredConfig>({ ...DEFAULT_CONFIG, ...stored })

/**
 * Change a setting, and keep it on the server the way the Files app keeps
 * its own. It goes back to what it was if it cannot be saved.
 *
 * @param key - The setting
 * @param value - Its new value
 */
async function setConfig<K extends keyof StoredConfig>(key: K, value: StoredConfig[K]): Promise<void> {
	const previous = config[key]
	config[key] = value
	if (stored === null) {
		return
	}
	try {
		await axios.put(generateOcsUrl('apps/viewer/api/v1/config/{key}', { key }), { value })
	} catch (error) {
		logger.error(`Could not save the viewer setting ${key}`, { error })
		config[key] = previous
		showError(t('Could not save your viewer settings'))
	}
}

/**
 * The user's viewer settings, the same for every viewer on the page.
 */
export function useViewerSettings() {
	return {
		slideshowDelay: toRef(readonly(config), 'slideshow_delay'),
		volume: toRef(readonly(config), 'volume'),
		muted: toRef(readonly(config), 'muted'),
		setSlideshowDelay: (seconds: number) => setConfig('slideshow_delay', seconds),
		setVolume: (percent: number) => setConfig('volume', percent),
		setMuted: (muted: boolean) => setConfig('muted', muted),
	}
}
