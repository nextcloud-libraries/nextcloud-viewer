<!--
  - SPDX-FileCopyrightText: 2020 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<!-- eslint-disable vue/no-unused-refs -- the player ref is consumed by useVideojsAdapter, the audio one by useMediaPlayer, via useTemplateRef -->
	<media-i18n :lang="playerLanguage">
		<audio-player ref="player">
			<audio-skin class="viewer-media">
				<audio
					ref="audio"
					:autoplay="true"
					:src="src"
					preload="metadata"
					@error.capture.prevent.stop="onFail"
					@ended="donePlaying"
					@pause="onPause"
					@play="onPlay"
					@canplay="doneLoading">

					<!-- Omitting `type` on purpose because most of the
						browsers auto detect the appropriate codec.
						Having it set force the browser to comply to
						the provided mime instead of detecting a potential
						compatibility. -->

					{{ t('Your browser does not support audio.') }}
				</audio>
			</audio-skin>
		</audio-player>
	</media-i18n>
</template>

<script setup lang="ts">
import type { ViewerEmits, ViewerProps } from '../viewer.ts'

import { useMediaPlayer } from '../composables/useMediaPlayer.ts'
import { useVideojsAdapter } from '../composables/useVideojsAdapter.ts'
import { t } from '../utils/l10n.ts'
import { playerLanguage } from '../utils/playerTranslations.ts'

import '@videojs/html/audio/player'
import '@videojs/html/audio/skin'

defineOptions({
	name: 'ViewerAudios',
})

const props = defineProps<ViewerProps>()
const emit = defineEmits<ViewerEmits>()

const adapter = useVideojsAdapter()
const {
	onFail,
	donePlaying,
	doneLoading,
	onPause,
	onPlay,
	src,
} = useMediaPlayer(true, props, emit, adapter)
</script>

<style scoped lang="scss">
.viewer-media {
	// The skin's public settings: the rest of its look is its own
	--media-accent-color: var(--color-primary-element);
	--media-accent-text-color: var(--color-primary-element-text);
	--media-font-family: var(--font-face);
	// The viewer is dark whatever the theme, and the audio skin follows this
	color-scheme: dark;

	display: block;
	/* over arrows in tiny screens */
	z-index: 20050;
	align-self: center;
	justify-self: center;
	// It stretches to what it is given, and the viewer gives it nothing:
	// a width of its own, clear of the viewer's arrows on a narrow screen
	width: 600px;
	max-width: calc(100vw - 4 * var(--default-clickable-area));
}
</style>
