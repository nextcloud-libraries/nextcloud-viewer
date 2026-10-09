/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import ViewerSettings from '../../lib/components/ViewerSettings.vue'
import { useViewerSettings } from '../../lib/composables/useViewerSettings.ts'

const NcSelectStub = defineComponent({
	name: 'NcSelect',
	props: { options: { type: Array, default: () => [] }, modelValue: { type: Object, default: null } },
	emits: ['update:modelValue'],
	template: '<div class="nc-select-stub" />',
})

/** The settings dialog, with only the delay dropdown rendered */
function mountSettings() {
	return mount(ViewerSettings, {
		props: { open: true },
		global: {
			stubs: {
				NcAppSettingsDialog: { template: '<div><slot /></div>' },
				NcAppSettingsSection: { template: '<div><slot /></div>' },
				NcAppSettingsShortcutsSection: true,
				NcSelect: NcSelectStub,
			},
		},
	})
}

afterEach(async () => {
	await useViewerSettings().setSlideshowDelay(5)
})

describe('the slideshow delay dropdown', () => {
	it('offers the delays, with the current one picked', () => {
		const select = mountSettings().findComponent(NcSelectStub)

		expect(select.props('options')).toEqual([
			{ id: 3, label: '3 seconds' },
			{ id: 5, label: '5 seconds' },
			{ id: 10, label: '10 seconds' },
			{ id: 30, label: '30 seconds' },
		])
		expect(select.props('modelValue')).toEqual({ id: 5, label: '5 seconds' })
	})

	// The server takes any delay from 1 to 60 seconds
	it('lists the current delay too when it is none of the offered ones', async () => {
		await useViewerSettings().setSlideshowDelay(7)
		const select = mountSettings().findComponent(NcSelectStub)

		expect((select.props('options') as { id: number }[]).map((option) => option.id)).toEqual([3, 5, 7, 10, 30])
		expect(select.props('modelValue')).toEqual({ id: 7, label: '7 seconds' })
	})

	it('saves the picked delay', async () => {
		const select = mountSettings().findComponent(NcSelectStub)

		select.vm.$emit('update:modelValue', { id: 30, label: '30 seconds' })
		await select.vm.$nextTick()

		expect(useViewerSettings().slideshowDelay.value).toBe(30)
		expect(select.props('modelValue')).toEqual({ id: 30, label: '30 seconds' })
	})
})
