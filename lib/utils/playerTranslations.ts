/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getCanonicalLocale, getLanguage } from '@nextcloud/l10n'
import { registerI18n } from '@videojs/html/i18n'
import { t } from './l10n.ts'

/**
 * The language the player speaks, as the BCP 47 tag Video.js expects
 * (`pt-BR`, where the server says `pt_BR`).
 */
export const playerLanguage = getLanguage().replace('_', '-')

/**
 * Give Video.js our own translations of the labels the skins show. Done
 * once, as this module is imported by the players.
 *
 * Video.js ships packs of its own, loaded on demand, but ours go through
 * the Nextcloud translators like every other string of the viewer, and a
 * language registered here never fetches its pack. Keys the skins do not
 * use (casting, live streams...) are left out.
 */
function registerPlayerTranslations(): void {
	registerI18n(playerLanguage, {
		buttons: {
			play: t('Play'),
			pause: t('Pause'),
			replay: t('Replay'),
			mute: t('Mute'),
			unmute: t('Unmute'),
		},
		seek: {
			forward: t('Forward {seconds}s'),
			backward: t('Rewind {seconds}s'),
		},
		fullscreen: {
			enter: t('Enter fullscreen'),
			exit: t('Exit fullscreen'),
		},
		captions: {
			enable: t('Enable captions'),
			disable: t('Disable captions'),
		},
		pip: {
			enter: t('Enter picture-in-picture'),
			exit: t('Exit picture-in-picture'),
		},
		airplay: {
			start: t('Start AirPlay'),
			stop: t('Stop AirPlay'),
		},
		slider: {
			seek: t('Seek'),
		},
		time: {
			current: t('Current time'),
			duration: t('Duration'),
			remaining: t('Remaining'),
			elapsedSuffix: t('{duration} elapsed'),
			durationSuffix: t('{duration} duration'),
			remainingSuffix: t('{duration} remaining'),
			showElapsed: t('Show elapsed time, {duration}.'),
			showDuration: t('Show duration, {duration}.'),
			showRemaining: t('Show remaining time, {duration}.'),
			toggleElapsed: t('Toggle between elapsed and remaining time.'),
			toggleDuration: t('Toggle between duration and remaining time.'),
			position: t('{current} of {duration}'),
			unknown: t('Media not loaded, unknown time.'),
		},
		playback: {
			rate: t('Playback rate {rate}'),
		},
		volume: {
			mutedValue: t('{percent}, muted'),
			muted: t('Muted'),
			label: t('Volume'),
			value: t('Volume {value}'),
		},
		status: {
			captionsOn: t('Captions on'),
			captionsOff: t('Captions off'),
			paused: t('Paused'),
			playing: t('Playing'),
			fullscreen: t('Fullscreen'),
			pip: t('Picture in picture'),
			exitPip: t('Exit picture in picture'),
			seekedTo: t('Seeked to {time}'),
		},
		container: {
			label: t('Media player'),
		},
		errors: {
			aborted: t('You stopped media playback before it finished.'),
			network: t('This media could not be loaded due to a network or server issue.'),
			decode: t('This media could not be played. It may be corrupted, or your browser may not support its format.'),
			source: t('This media could not be loaded. It may be unavailable, or your browser may not support its format.'),
			encrypted: t('This media could not be played because it could not be decrypted.'),
			unplayable: t('This media is unsupported by the player.'),
			title: t('Something went wrong.'),
			unexpected: t('An unexpected error occurred.'),
		},
		common: {
			ok: t('OK'),
		},
		menu: {
			settings: t('Settings'),
			quality: t('Quality'),
			audio: t('Audio'),
			default: t('Default'),
			auto: t('Auto'),
			autoWithLabel: t('Auto ({label})'),
			speed: t('Speed'),
			captions: t('Captions'),
			playbackRate: t('Playback rate'),
			back: t('Go back to previous menu'),
			off: t('Disabled'),
			subtitles: t('Subtitles'),
		},
	})
}

registerPlayerTranslations()

/**
 * A playback rate as the user writes numbers: `1,5×` in German, where
 * Video.js would write `1.5×` whatever the language.
 *
 * @param rate The playback rate
 */
export function formatRate(rate: number): string {
	return rate === 1
		? t('Normal')
		: `${new Intl.NumberFormat(getCanonicalLocale()).format(rate)}×`
}
