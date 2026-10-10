<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<NcAppSettingsDialog
		:open="open"
		:name="t('Viewer settings')"
		showNavigation
		noVersion
		@update:open="emit('update:open', $event)">
		<NcAppSettingsSection id="viewer-settings-slideshow" :name="t('Slideshow')">
			<NcSelect
				:inputLabel="t('Show each file for')"
				:options="delayOptions"
				:modelValue="selectedDelay"
				:clearable="false"
				:searchable="false"
				@update:modelValue="onDelaySelected" />
		</NcAppSettingsSection>

		<NcAppSettingsShortcutsSection>
			<NcHotkeyList :label="t('Navigation')">
				<!-- Previous and next follow the reading direction -->
				<NcHotkey :label="t('Previous file')" :hotkey="rtl ? 'ArrowRight' : 'ArrowLeft'" />
				<NcHotkey :label="t('Next file')" :hotkey="rtl ? 'ArrowLeft' : 'ArrowRight'" />
				<NcHotkey :label="t('Close')" hotkey="Escape" />
			</NcHotkeyList>
			<NcHotkeyList :label="t('Actions')">
				<NcHotkey :label="t('Download')" hotkey="Control S" />
				<NcHotkey :label="t('Delete')" hotkey="Control Delete" />
				<NcHotkey :label="t('Edit')" hotkey="Control E" />
				<NcHotkey :label="t('Full screen')" hotkey="F" />
			</NcHotkeyList>
			<NcHotkeyList :label="t('View')">
				<NcHotkey :label="t('Switch between side by side and differences')" hotkey="D" />
				<NcHotkey :label="t('Show these settings')" hotkey="?" />
			</NcHotkeyList>
		</NcAppSettingsShortcutsSection>
	</NcAppSettingsDialog>
</template>

<script setup lang="ts">
import { isRTL } from '@nextcloud/l10n'
import { computed } from 'vue'
import NcAppSettingsDialog from '@nextcloud/vue/components/NcAppSettingsDialog'
import NcAppSettingsSection from '@nextcloud/vue/components/NcAppSettingsSection'
import NcAppSettingsShortcutsSection from '@nextcloud/vue/components/NcAppSettingsShortcutsSection'
import NcHotkey from '@nextcloud/vue/components/NcHotkey'
import NcHotkeyList from '@nextcloud/vue/components/NcHotkeyList'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import { useViewerSettings } from '../composables/useViewerSettings.ts'
import { n, t } from '../utils/l10n.ts'

defineProps<{
	/** Whether the dialog is open */
	open: boolean
}>()

const emit = defineEmits<{
	'update:open': [open: boolean]
}>()

/** The delays offered, in seconds */
const SLIDESHOW_DELAYS = [3, 5, 10, 30]

interface DelayOption {
	/** The delay, in seconds */
	id: number
	label: string
}

const rtl = isRTL()
const { slideshowDelay, setSlideshowDelay } = useViewerSettings()

// The current delay is listed too when it is none of the offered ones:
// the server accepts any from 1 to 60 seconds
const delayOptions = computed<DelayOption[]>(() => [...new Set([...SLIDESHOW_DELAYS, slideshowDelay.value])]
	.sort((a, b) => a - b)
	.map((seconds) => ({ id: seconds, label: n('{count} second', '{count} seconds', seconds, { count: seconds }) })))

const selectedDelay = computed(() => delayOptions.value.find((option) => option.id === slideshowDelay.value))

/**
 * Save the delay picked in the dropdown.
 *
 * @param option - The picked option
 */
function onDelaySelected(option: DelayOption | null) {
	if (option) {
		setSlideshowDelay(option.id)
	}
}
</script>
