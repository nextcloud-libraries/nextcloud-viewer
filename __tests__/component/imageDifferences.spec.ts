/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ImageDifferences from '../../lib/components/ImageDifferences.vue'
import Images from '../../lib/components/Images.vue'
import { makeFile } from '../factories.ts'

/**
 * Two versions of a picture, with the previews the versions tab gives them
 */
function twoVersions() {
	const older = makeFile({ basename: 'photo.jpg', mime: 'image/jpeg', attributes: { previewUrl: '/preview/older' } })
	const current = makeFile({ basename: 'photo.jpg', mime: 'image/jpeg', attributes: { previewUrl: '/preview/current' } })
	return [older, current]
}

function mountDifferences() {
	return mount(ImageDifferences, { props: { files: twoVersions(), maxWidth: 800, maxHeight: 600 } })
}

describe('the differences between two images', () => {
	it('shows the other one over the base, cut at the slider', async () => {
		const wrapper = mountDifferences()
		const [base, other] = wrapper.findAll('img')

		expect(base!.attributes('src')).toBe('/preview/older')
		expect(other!.attributes('src')).toBe('/preview/current')
		expect(other!.attributes('style')).toContain('inset(0 0 0 50%)')

		await wrapper.find('input[type="range"]').setValue('20')
		expect(other!.attributes('style')).toContain('inset(0 0 0 20%)')
	})

	it('is loaded once both images are', async () => {
		const wrapper = mountDifferences()
		const [base, other] = wrapper.findAll('img')

		await base!.trigger('load')
		expect(wrapper.emitted('loaded')).toBeUndefined()
		await other!.trigger('load')
		expect(wrapper.emitted('loaded')).toHaveLength(1)
	})

	it('fails once when an image cannot be shown', async () => {
		const wrapper = mountDifferences()
		const [base, other] = wrapper.findAll('img')

		await base!.trigger('error')
		await other!.trigger('error')
		expect(wrapper.emitted('errored')).toHaveLength(1)
	})

	// Dragging the slider would otherwise step to another file
	it('keeps the viewer from swiping', () => {
		expect(mountDifferences().emitted('update:canSwipe')).toEqual([[false]])
	})

	it('is what the image handler shows for the differences, without loading the file on its own', () => {
		const files = twoVersions()
		const wrapper = mount(Images, { props: { file: files[1]!, files, comparison: 'differences', maxWidth: 800, maxHeight: 600, editing: false, isSidebarShown: false } })

		expect(wrapper.findComponent(ImageDifferences).exists()).toBe(true)
		expect(wrapper.find('.image_container').exists()).toBe(false)
	})
})
