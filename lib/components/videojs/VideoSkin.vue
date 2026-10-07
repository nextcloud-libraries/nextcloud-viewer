<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- The Video.js video skin (lib/components/videojs/vendor), the media in its slot -->
<template>
	<!-- eslint-disable vue/no-lone-template -- native templates Video.js builds menu items from, see useSkinTemplates -->
	<media-container
		ref="root"
		class="media-skin media-container video-skin viewer-media"
		:class="{ 'viewer-media--stopped': stopped }"
		data-theme="default"
		data-preset="video">
		<slot />
		<media-poster class="media-poster">
			<img alt="" decoding="async" class="media-poster-image">
		</media-poster>
		<media-buffering-indicator class="media-buffering-indicator">
			<media-icon name="spinner" class="media-buffering-indicator-spinner-icon" />
		</media-buffering-indicator>
		<media-controls>
			<media-controls-backdrop class="video-controls-backdrop" />
			<media-controls-content class="video-controls video-controls-content">
				<media-tooltip-group>
					<media-controls-group class="video-controls-primary">
						<media-play-button :id="`${id}-p0`" class="media-button media-play-button">
							<media-icon name="restart" class="media-button-icon media-play-button-restart-icon" />
							<media-icon name="play" class="media-button-icon media-play-button-play-icon" />
							<media-icon name="pause" class="media-button-icon media-play-button-pause-icon" />
						</media-play-button>
						<media-tooltip :trigger="`${id}-p0`" side="top" class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip">
							<media-tooltip-label />
							<media-tooltip-shortcut class="media-tooltip-shortcut" />
						</media-tooltip>
						<media-mute-button :id="`${id}-p1`" :commandfor="`${id}-p2`" class="media-button media-mute-button video-controls-volume-button">
							<media-icon name="volume-off" class="media-button-icon media-mute-button-off-icon" />
							<media-icon name="volume-low" class="media-button-icon media-mute-button-low-icon" />
							<media-icon name="volume-high" class="media-button-icon media-mute-button-high-icon" />
						</media-mute-button>
						<media-tooltip
							:trigger="`${id}-p1`"
							delay="0"
							disabled
							sticky
							side="top"
							class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip">
							<media-tooltip-label />
							<media-tooltip-shortcut class="media-tooltip-shortcut" />
						</media-tooltip>
						<media-volume-popover
							:id="`${id}-p2`"
							openOnHover
							delay="200"
							closeDelay="100"
							side="top"
							class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-volume-popover">
							<media-volume-slider class="media-slider media-volume-slider" thumbAlignment="edge" orientation="vertical">
								<media-slider-track class="media-slider-track">
									<media-slider-fill class="media-slider-fill" />
								</media-slider-track>
								<media-slider-thumb class="media-slider-thumb media-volume-slider-thumb" />
							</media-volume-slider>
						</media-volume-popover>
						<media-controls-group class="video-time-slider-group">
							<media-time class="media-time-value video-time-value" type="current" />
							<media-time-slider class="media-slider media-time-slider">
								<media-time-slider-chapters class="media-time-slider-chapters">
									<template>
										<div class="media-time-slider-chapter">
											<media-slider-track class="media-slider-track media-time-slider-chapter-track">
												<media-slider-buffer class="media-slider-buffer media-time-slider-chapter-layer" />
												<media-slider-fill class="media-slider-fill media-time-slider-chapter-layer" />
											</media-slider-track>
										</div>
									</template>
								</media-time-slider-chapters>
								<media-slider-thumb class="media-slider-thumb media-time-slider-thumb" />
								<media-slider-preview class="media-slider-preview" overflow="visible">
									<div class="media-slider-preview-content media-time-slider-preview-content">
										<media-time-slider-chapter-title class="media-time-slider-chapter-title" />
										<media-slider-value class="media-time-slider-value" type="pointer" />
									</div>
								</media-slider-preview>
							</media-time-slider>
							<media-time class="media-time-toggle video-time-value" type="remaining" toggle />
						</media-controls-group>
						<media-captions-button :id="`${id}-p3`" class="media-button media-captions-button video-controls-captions-button">
							<media-icon name="captions-off" class="media-button-icon media-captions-button-off-icon" />
							<media-icon name="captions-on" class="media-button-icon media-captions-button-on-icon" />
						</media-captions-button>
						<media-tooltip :trigger="`${id}-p3`" side="top" class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip">
							<media-tooltip-label />
							<media-tooltip-shortcut class="media-tooltip-shortcut" />
						</media-tooltip>
						<button :id="`${id}-p4`" :commandfor="`${id}-p5`" class="media-button media-settings-menu-trigger video-controls-settings-button">
							<media-icon name="gear" class="media-button-icon-base media-settings-menu-trigger-icon" />
							<media-text class="media-settings-menu-trigger-label" token="menu.settings">
								Settings
							</media-text>
						</button>
						<media-tooltip :trigger="`${id}-p4`" side="top" class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip">
							<media-text token="menu.settings">
								Settings
							</media-text>
						</media-tooltip>
						<media-menu
							:id="`${id}-p5`"
							side="top"
							align="center"
							class="media-popup media-popup-surface media-menu-popup media-menu-resizable-popup">
							<media-menu-content class="media-menu-content">
								<media-menu-item :commandfor="`${id}-p6`" class="media-menu-trigger-item">
									<media-icon name="speed" class="media-menu-trigger-item-icon" />
									<media-text token="menu.speed">
										Speed
									</media-text>
									<span class="media-menu-hint">
										<span data-part="value" class="media-menu-hint-label" />
										<media-icon name="chevron" class="media-menu-forward-chevron" />
									</span>
								</media-menu-item>
								<media-menu-content :id="`${id}-p6`" class="media-menu-content">
									<media-menu-item class="media-menu-back-item">
										<media-icon name="chevron" class="media-menu-back-chevron" />
										<media-text token="menu.speed">
											Speed
										</media-text>
									</media-menu-item>
									<media-menu-separator class="media-menu-separator" />
									<media-playback-rate-radio-group class="media-menu-radio-group" :formatRate.prop="formatRate">
										<template>
											<media-menu-radio-item class="media-menu-radio-item">
												<span data-part="label" />
												<media-menu-item-indicator forceMount class="media-menu-item-indicator">
													<media-icon name="check" class="media-menu-radio-item-icon" />
												</media-menu-item-indicator>
											</media-menu-radio-item>
										</template>
									</media-playback-rate-radio-group>
								</media-menu-content>
								<media-menu-item :commandfor="`${id}-p7`" class="media-menu-trigger-item">
									<media-icon name="captions-off" class="media-menu-trigger-item-icon" />
									<media-text token="menu.captions">
										Captions
									</media-text>
									<span class="media-menu-hint">
										<span data-part="value" class="media-menu-hint-label" />
										<media-icon name="chevron" class="media-menu-forward-chevron" />
									</span>
								</media-menu-item>
								<media-menu-content :id="`${id}-p7`" class="media-menu-content">
									<media-menu-item class="media-menu-back-item">
										<media-icon name="chevron" class="media-menu-back-chevron" />
										<media-text token="menu.captions">
											Captions
										</media-text>
									</media-menu-item>
									<media-menu-separator class="media-menu-separator" />
									<media-captions-radio-group class="media-menu-radio-group">
										<template>
											<media-menu-radio-item class="media-menu-radio-item">
												<span data-part="label" />
												<media-menu-item-indicator forceMount class="media-menu-item-indicator">
													<media-icon name="check" class="media-menu-radio-item-icon" />
												</media-menu-item-indicator>
											</media-menu-radio-item>
										</template>
									</media-captions-radio-group>
								</media-menu-content>
							</media-menu-content>
						</media-menu>
					</media-controls-group>
					<media-controls-group class="video-controls-secondary">
						<media-fullscreen-button :id="`${id}-p8`" class="media-button media-fullscreen-button">
							<media-icon name="fullscreen-enter" class="media-button-icon media-fullscreen-button-enter-icon" />
							<media-icon name="fullscreen-exit" class="media-button-icon media-fullscreen-button-exit-icon" />
						</media-fullscreen-button>
						<media-tooltip :trigger="`${id}-p8`" side="top" class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip">
							<media-tooltip-label />
							<media-tooltip-shortcut class="media-tooltip-shortcut" />
						</media-tooltip>
					</media-controls-group>
				</media-tooltip-group>
			</media-controls-content>
		</media-controls>
		<!-- No seeking with the arrow keys: they move to the previous and next file -->
		<media-hotkey keys="Space" action="togglePaused" />
		<media-hotkey keys="k" action="togglePaused" />
		<media-hotkey keys="m" action="toggleMuted" />
		<media-hotkey keys="l" action="seekStep" />
		<media-hotkey keys="j" action="seekStep" />
		<media-hotkey keys="ArrowUp" action="volumeStep" />
		<media-hotkey keys="ArrowDown" action="volumeStep" />
		<media-hotkey keys="0-9" action="seekToPercent" />
		<media-hotkey keys="Home" action="seekToPercent" value="0" />
		<media-hotkey keys="End" action="seekToPercent" value="100" />
		<media-hotkey keys="&gt;" action="speedUp" />
		<media-hotkey keys="&lt;" action="speedDown" />
		<media-hotkey keys="f" action="toggleFullscreen" />
		<media-hotkey keys="c" action="toggleSubtitles" />
		<media-gesture
			type="tap"
			action="togglePaused"
			pointer="mouse"
			region="center" />
		<media-gesture type="tap" action="toggleControls" pointer="touch" />
		<media-gesture type="doubletap" action="seekStep" region="left" />
		<media-gesture type="doubletap" action="toggleFullscreen" region="center" />
		<media-gesture type="doubletap" action="seekStep" region="right" />
		<media-status-announcer class="media-status-announcer" />
		<div class="video-status-indicators">
			<media-volume-indicator class="media-indicator media-volume-indicator">
				<media-volume-indicator-fill class="media-indicator-content media-volume-indicator-fill">
					<media-icon name="volume-high" class="media-volume-indicator-high-icon" />
					<media-icon name="volume-low" class="media-volume-indicator-low-icon" />
					<media-icon name="volume-off" class="media-volume-indicator-off-icon" />
					<media-volume-indicator-value class="media-volume-indicator-value" />
				</media-volume-indicator-fill>
			</media-volume-indicator>
			<media-status-indicator actions="toggleSubtitles,toggleFullscreen" class="media-indicator media-status-indicator">
				<div class="media-indicator-content media-status-indicator-content">
					<media-icon name="captions-on" class="media-status-indicator-captions-on-icon" />
					<media-icon name="captions-off" class="media-status-indicator-captions-off-icon" />
					<media-icon name="fullscreen-enter" class="media-status-indicator-fullscreen-enter-icon" />
					<media-icon name="fullscreen-exit" class="media-status-indicator-fullscreen-exit-icon" />
					<media-status-indicator-value class="media-status-indicator-value" />
				</div>
			</media-status-indicator>
			<media-seek-indicator class="media-seek-indicator">
				<media-icon name="chevron" class="media-seek-indicator-icon" />
				<media-seek-indicator-value class="media-seek-indicator-value" />
			</media-seek-indicator>
			<media-status-indicator actions="togglePaused" class="media-playback-status-indicator">
				<media-icon name="play" class="media-playback-status-indicator-play-icon" />
				<media-icon name="pause" class="media-playback-status-indicator-pause-icon" />
			</media-status-indicator>
		</div>
	</media-container>
</template>

<script setup lang="ts">
import { useId, useTemplateRef } from 'vue'
import { formatRate } from '../../utils/playerTranslations.ts'
import { useSkinTemplates } from './useSkinTemplates.ts'

import './videoSkin.ts'

defineProps<{
	/** Whether the media is back at its start once played, with its poster over it */
	stopped?: boolean
}>()

// Ties each control to its tooltip and menu, unique to the player: the
// viewer can show two side by side
const id = useId()

useSkinTemplates(useTemplateRef<HTMLElement>('root'))
</script>
