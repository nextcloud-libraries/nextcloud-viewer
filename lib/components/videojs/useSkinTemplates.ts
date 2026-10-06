/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { ShallowRef } from 'vue'

import { onMounted } from 'vue'

/**
 * Move the children of the skin's `<template>`s into their content.
 *
 * The skin's menus and time slider build their items from a `<template>`
 * child, read from its `content`. Vue renders the elements written inside
 * one as its children instead, which leaves the content empty and the
 * items without their check mark. Video.js reads the template again on
 * every update, so moving them once mounted is enough.
 *
 * @param root The skin's root element
 */
export function useSkinTemplates(root: Readonly<ShallowRef<HTMLElement | null>>): void {
	onMounted(() => {
		root.value?.querySelectorAll('template').forEach((template) => {
			template.content.append(...Array.from(template.childNodes))
		})
	})
}
