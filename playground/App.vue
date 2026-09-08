<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import type { IFile } from '@nextcloud/files'

import { File, Permission } from '@nextcloud/files'
import { getViewer, registerDefaultHandlers } from '../lib/index.ts'

// The handlers for images, video and audio. Nothing of the viewer itself is
// loaded until one of these files is opened.
registerDefaultHandlers()

interface Fixture {
	name: string
	mime: string
	/** Whether the viewer offers its editor for this one */
	editable?: boolean
}

const fixtures: Fixture[] = [
	{ name: 'photo.jpg', mime: 'image/jpeg', editable: true },
	{ name: 'gradient.jpg', mime: 'image/jpeg', editable: true },
	{ name: 'portrait.jpg', mime: 'image/jpeg', editable: true },
	{ name: 'animation.gif', mime: 'image/gif' },
	{ name: 'video.mp4', mime: 'video/mp4' },
	{ name: 'audio.mp3', mime: 'audio/mpeg' },
]

/**
 * The fixtures as Files nodes.
 *
 * Their source is a plain URL served by this page, not a WebDAV one, and
 * `hasPreview` is left off so the viewer loads that URL directly instead of
 * asking a previews endpoint that does not exist here.
 */
const nodes: IFile[] = fixtures.map((fixture, index) => new File({
	source: new URL(`./media/${fixture.name}`, window.location.href).href,
	// Where these files live, as far as the node is concerned: it has to be
	// a prefix of the source path
	root: '/media',
	id: index + 1,
	mime: fixture.mime,
	owner: 'playground',
	mtime: new Date('2026-01-01T00:00:00Z'),
	permissions: fixture.editable ? Permission.ALL : Permission.READ,
	attributes: { hasPreview: false },
}))

/**
 * Open the viewer on one of the fixtures, with the rest as the list to
 * page through.
 *
 * @param node the file to show
 */
function open(node: IFile) {
	getViewer().open(nodes, node)
}
</script>

<template>
	<main class="playground">
		<h1>@nextcloud/viewer</h1>
		<p class="playground__intro">
			Files served straight from this page, so the viewer runs with no
			Nextcloud server behind it. Pick one to open it.
		</p>
		<ul class="playground__files">
			<li v-for="node in nodes" :key="node.source">
				<button type="button" @click="open(node)">
					{{ node.basename }}
					<span class="playground__mime">{{ node.mime }}</span>
				</button>
			</li>
		</ul>
	</main>
</template>

<style scoped>
.playground {
	max-inline-size: 40rem;
	margin: 0 auto;
	padding: 2rem 1rem;
}

.playground__intro {
	color: var(--color-text-maxcontrast, #6b6b6b);
}

.playground__files {
	list-style: none;
	padding: 0;
	display: grid;
	gap: 0.5rem;
}

.playground__files button {
	inline-size: 100%;
	display: flex;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.75rem 1rem;
	border: 1px solid var(--color-border, #ddd);
	border-radius: var(--border-radius-element, 8px);
	background: var(--color-main-background, #fff);
	color: inherit;
	font: inherit;
	cursor: pointer;
}

.playground__files button:hover {
	background: var(--color-background-hover, #f5f5f5);
}

.playground__mime {
	color: var(--color-text-maxcontrast, #6b6b6b);
}
</style>
