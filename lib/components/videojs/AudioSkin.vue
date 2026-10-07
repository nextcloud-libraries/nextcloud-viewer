<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!-- The Video.js audio skin (lib/components/videojs/vendor), the media in its slot -->
<template>
	<!-- eslint-disable vue/no-lone-template -- native templates Video.js builds menu items from, see useSkinTemplates -->
	<media-container
		ref="root"
		class="media-skin media-container audio-skin viewer-media"
		:class="{ 'viewer-media--stopped': stopped }"
		data-theme="default"
		data-preset="audio">
		<slot />
		<media-controls visibility="always">
			<media-controls-content class="audio-controls audio-controls-content">
				<media-tooltip-group>
					<media-controls-group class="audio-controls-start">
						<div class="audio-play-button">
							<media-buffering-indicator class="media-buffering-indicator audio-play-button-buffering-indicator">
								<media-icon name="spinner" class="media-buffering-indicator-spinner-icon" />
							</media-buffering-indicator>
							<media-play-button :id="`${id}-p0`" class="media-button media-play-button">
								<media-icon name="restart" class="media-button-icon media-play-button-restart-icon" />
								<media-icon name="play" class="media-button-icon media-play-button-play-icon" />
								<media-icon name="pause" class="media-button-icon media-play-button-pause-icon" />
							</media-play-button>
							<media-tooltip
								:trigger="`${id}-p0`"
								boundary="viewport"
								side="top"
								class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip">
								<media-tooltip-label />
								<media-tooltip-shortcut class="media-tooltip-shortcut" />
							</media-tooltip>
						</div>
						<media-seek-button :id="`${id}-p1`" seconds="-10" class="media-button media-seek-button audio-seek-button">
							<div class="media-seek-button-content">
								<media-icon name="seek" class="media-button-icon media-seek-button-backward-icon" />
								<span class="media-seek-button-label media-seek-button-backward-label">10</span>
							</div>
						</media-seek-button>
						<media-tooltip
							:trigger="`${id}-p1`"
							boundary="viewport"
							side="top"
							class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip">
							<media-tooltip-label />
							<media-tooltip-shortcut class="media-tooltip-shortcut" />
						</media-tooltip>
						<media-seek-button :id="`${id}-p2`" seconds="10" class="media-button media-seek-button audio-seek-button">
							<div class="media-seek-button-content">
								<media-icon name="seek" class="media-button-icon" />
								<span class="media-seek-button-label media-seek-button-forward-label">10</span>
							</div>
						</media-seek-button>
						<media-tooltip
							:trigger="`${id}-p2`"
							boundary="viewport"
							side="top"
							class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip">
							<media-tooltip-label />
							<media-tooltip-shortcut class="media-tooltip-shortcut" />
						</media-tooltip>
					</media-controls-group>
					<media-controls-group class="audio-time-slider-group">
						<media-time class="media-time-value" type="current" />
						<media-time-slider class="media-slider audio-time-slider">
							<media-slider-track class="media-slider-track">
								<media-slider-buffer class="media-slider-buffer" />
								<media-slider-fill class="media-slider-fill" />
							</media-slider-track>
							<media-slider-thumb class="media-slider-thumb audio-time-slider-thumb" />
							<media-slider-preview class="media-slider-preview" overflow="visible">
								<div class="media-slider-preview-content media-popup-surface media-tooltip audio-time-slider-preview-content">
									<media-slider-value class="audio-time-slider-value" type="pointer" />
								</div>
							</media-slider-preview>
						</media-time-slider>
						<media-time class="media-time-toggle audio-time-remaining-value" type="remaining" toggle />
					</media-controls-group>
					<media-controls-group class="audio-controls-end">
						<media-playback-rate-button :id="`${id}-p3`" :commandfor="`${id}-p4`" class="media-button media-playback-rate-button">
							{{ formatRate(rate) }}
						</media-playback-rate-button>
						<media-tooltip
							:trigger="`${id}-p3`"
							boundary="viewport"
							side="top"
							class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip">
							<media-tooltip-label />
							<media-tooltip-shortcut class="media-tooltip-shortcut" />
						</media-tooltip>
						<media-menu
							:id="`${id}-p4`"
							side="top"
							align="center"
							boundary="viewport"
							class="media-popup media-popup-surface media-menu-popup audio-settings-menu-popup">
							<media-menu-content class="media-menu-content">
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
						</media-menu>
						<media-mute-button :id="`${id}-p5`" :commandfor="`${id}-p6`" class="media-button media-mute-button">
							<media-icon name="volume-off" class="media-button-icon media-mute-button-off-icon" />
							<media-icon name="volume-low" class="media-button-icon media-mute-button-low-icon" />
							<media-icon name="volume-high" class="media-button-icon media-mute-button-high-icon" />
						</media-mute-button>
						<media-tooltip
							:trigger="`${id}-p5`"
							delay="0"
							disabled
							sticky
							side="top"
							class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-tooltip">
							<media-tooltip-label />
							<media-tooltip-shortcut class="media-tooltip-shortcut" />
						</media-tooltip>
						<media-volume-popover
							:id="`${id}-p6`"
							openOnHover
							delay="200"
							closeDelay="100"
							side="top"
							boundary="viewport"
							class="media-popup media-popup-safe-area media-popup-transition media-popup-surface media-volume-popover">
							<media-volume-slider class="media-slider media-volume-slider" thumbAlignment="edge" orientation="vertical">
								<media-slider-track class="media-slider-track">
									<media-slider-fill class="media-slider-fill" />
								</media-slider-track>
								<media-slider-thumb class="media-slider-thumb media-volume-slider-thumb" />
							</media-volume-slider>
						</media-volume-popover>
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
		<media-status-announcer class="media-status-announcer" />
	</media-container>
</template>

<script setup lang="ts">
import { useId, useTemplateRef } from 'vue'
import { formatRate } from '../../utils/playerTranslations.ts'
import { useSkinTemplates } from './useSkinTemplates.ts'

import './audioSkin.ts'

defineProps<{
	/** Whether the media is back at its start once played */
	stopped?: boolean
	/** The playback rate, which the speed button shows */
	rate: number
}>()

// Ties each control to its tooltip and menu, unique to the player
const id = useId()

useSkinTemplates(useTemplateRef<HTMLElement>('root'))
</script>
