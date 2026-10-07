/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// The elements and styles VideoSkin.vue uses: the Video.js video skin,
// less its error dialog, title, casting and picture-in-picture
//
// vendor/ is the skin source of @videojs/html 10.0.1, copied unchanged from
// https://shadcn.videojs.org/r/html/video.json and its _style-* dependencies:
// update it by copying over, the Nextcloud look lives in nextcloud.css
import { registerIcons } from '@videojs/html/icons'
import {
	captionsOffIcon,
	captionsOnIcon,
	checkIcon,
	chevronIcon,
	fullscreenEnterIcon,
	fullscreenExitIcon,
	gearIcon,
	pauseIcon,
	playIcon,
	restartIcon,
	speedIcon,
	spinnerIcon,
	volumeHighIcon,
	volumeLowIcon,
	volumeOffIcon,
} from '@videojs/html/icons'
import { registerPlayerTranslations } from '../../utils/playerTranslations.ts'

import './vendor/styles/video/base.css'
import './vendor/video/skin.css'
import './nextcloud.css'
import '@videojs/html/video/player'
import '@videojs/html/ui/container'
import '@videojs/html/ui/poster'
import '@videojs/html/ui/buffering-indicator'
import '@videojs/html/ui/controls'
import '@videojs/html/ui/controls-backdrop'
import '@videojs/html/ui/controls-content'
import '@videojs/html/ui/tooltip-group'
import '@videojs/html/ui/controls-group'
import '@videojs/html/ui/play-button'
import '@videojs/html/ui/tooltip'
import '@videojs/html/ui/tooltip-label'
import '@videojs/html/ui/tooltip-shortcut'
import '@videojs/html/ui/mute-button'
import '@videojs/html/ui/volume-popover'
import '@videojs/html/ui/volume-slider'
import '@videojs/html/ui/slider-track'
import '@videojs/html/ui/slider-fill'
import '@videojs/html/ui/slider-thumb'
import '@videojs/html/ui/time'
import '@videojs/html/ui/time-slider'
import '@videojs/html/ui/time-slider-chapters'
import '@videojs/html/ui/slider-buffer'
import '@videojs/html/ui/slider-preview'
import '@videojs/html/ui/time-slider-chapter-title'
import '@videojs/html/ui/slider-value'
import '@videojs/html/ui/captions-button'
import '@videojs/html/ui/menu'
import '@videojs/html/ui/menu-content'
import '@videojs/html/ui/menu-item'
import '@videojs/html/ui/menu-separator'
import '@videojs/html/ui/menu-radio-item'
import '@videojs/html/ui/menu-item-indicator'
import '@videojs/html/ui/playback-rate-radio-group'
import '@videojs/html/ui/captions-radio-group'
import '@videojs/html/ui/fullscreen-button'
import '@videojs/html/ui/hotkey'
import '@videojs/html/ui/gesture'
import '@videojs/html/ui/status-announcer'
import '@videojs/html/ui/volume-indicator'
import '@videojs/html/ui/volume-indicator-fill'
import '@videojs/html/ui/volume-indicator-value'
import '@videojs/html/ui/status-indicator'
import '@videojs/html/ui/status-indicator-value'
import '@videojs/html/ui/seek-indicator'
import '@videojs/html/ui/seek-indicator-value'

registerIcons('default', {
	'captions-off': captionsOffIcon,
	'captions-on': captionsOnIcon,
	check: checkIcon,
	chevron: chevronIcon,
	'fullscreen-enter': fullscreenEnterIcon,
	'fullscreen-exit': fullscreenExitIcon,
	gear: gearIcon,
	pause: pauseIcon,
	play: playIcon,
	restart: restartIcon,
	speed: speedIcon,
	spinner: spinnerIcon,
	'volume-high': volumeHighIcon,
	'volume-low': volumeLowIcon,
	'volume-off': volumeOffIcon,
})

registerPlayerTranslations()
