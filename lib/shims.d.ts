/*!
 * SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare module '*.svg?raw' {
	const content: string
	export default content
}

// The icons ship their types beside each component, at a path the package's
// own `exports` map does not offer, so nothing resolves them under bundler
// resolution. Declared for that package alone: a blanket `*.vue` would
// shadow the real types of this library's own components.
declare module 'vue-material-design-icons/*.vue' {
	import type { DefineComponent } from 'vue'

	const component: DefineComponent<{
		size?: number | string
		fillColor?: string
		title?: string
	}>
	export default component
}

// The plyr export is broken, let's fix it here
declare module 'plyr' {
	// Import the *type* from the real declaration file
	import type PlyrType from 'plyr/src/js/plyr.d.ts'
	// Import the *value* (class implementation) from the JS file
	import type PlyrImpl from 'plyr/src/js/plyr.js'

	const Plyr: typeof PlyrImpl & typeof PlyrType
	export default Plyr
}

// The plyr Vue wrapper ships no types
declare module '@skjnldsv/vue-plyr' {
	import type { Component } from 'vue'

	const VuePlyr: Component
	export default VuePlyr
}

declare module '*.mp4' {
	const src: string
	export default src
}
