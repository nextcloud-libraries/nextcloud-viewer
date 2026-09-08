/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IHandler } from './index.ts'
import type { Viewer } from './viewer.ts'

import { logger } from './services/logger.ts'

/**
 * The shape of what handlers register, independent of this package's own
 * version. Copies of the library that agree on this shape share one
 * registry and one viewer; a breaking change to `IHandler` moves the key
 * and the two generations stop seeing each other, which is the point.
 *
 * This is deliberately not the package version. Keying the scope by that
 * would split the registry on every major release, and since the viewer
 * is a single modal on the page, a split registry means handlers that
 * quietly never open.
 */
const ABI = 'handlers_v1'

/** A copy of the library offering to be the implementation on this page */
export interface ViewerCandidate {
	/** The offering copy's package version */
	version: string
	/** Loads and mounts that copy. Only ever called on the winner */
	load: () => Promise<unknown>
}

interface ViewerScope {
	handlers?: Map<string, IHandler>
	service?: Viewer
	candidates: ViewerCandidate[]
	implementation?: Promise<unknown>
}

declare global {
	interface Window {
		_nc_viewer_scope?: Record<string, ViewerScope>
	}
}

window._nc_viewer_scope ??= {}
window._nc_viewer_scope[ABI] ??= { candidates: [] }

/** State shared by every copy of the library that speaks this ABI */
export const scope: ViewerScope = window._nc_viewer_scope[ABI]

/**
 * Order two versions, newest last. Understands the `2.0.0-beta.1` shape:
 * a prerelease sorts below the release it leads to, so a stable 2.0.0
 * beats any 2.0.0-beta.
 *
 * @param a the first version
 * @param b the second version
 */
export function compareVersions(a: string, b: string): number {
	const [aCore, aPre] = a.split('-', 2)
	const [bCore, bPre] = b.split('-', 2)
	const aParts = aCore!.split('.').map(Number)
	const bParts = bCore!.split('.').map(Number)

	for (let i = 0; i < 3; i++) {
		const left = aParts[i] ?? 0
		const right = bParts[i] ?? 0
		if (left !== right) {
			return left - right
		}
	}

	if (aPre === bPre) {
		return 0
	}
	// No prerelease outranks any prerelease of the same core version
	if (aPre === undefined) {
		return 1
	}
	if (bPre === undefined) {
		return -1
	}

	// Dot-separated identifiers, numeric ones compared as numbers: beta.10
	// comes after beta.2, which a plain string comparison gets backwards
	const aIds = aPre.split('.')
	const bIds = bPre.split('.')
	for (let i = 0; i < Math.max(aIds.length, bIds.length); i++) {
		const left = aIds[i]
		const right = bIds[i]
		if (left === right) {
			continue
		}
		// A shorter run of identifiers sorts first
		if (left === undefined) {
			return -1
		}
		if (right === undefined) {
			return 1
		}
		const leftNumeric = /^\d+$/.test(left)
		const rightNumeric = /^\d+$/.test(right)
		if (leftNumeric && rightNumeric) {
			return Number(left) - Number(right)
		}
		// Numeric identifiers always sort below alphanumeric ones
		if (leftNumeric !== rightNumeric) {
			return leftNumeric ? -1 : 1
		}
		return left < right ? -1 : 1
	}
	return 0
}

/**
 * The major of a version, which is what decides whether two copies are
 * compatible with each other.
 *
 * @param version the version to read
 */
function major(version: string): string {
	return version.split('.', 1)[0] ?? version
}

/**
 * Offer this copy of the library as the page's viewer implementation.
 *
 * Registering is cheap: nothing is fetched, and the losing copies never
 * load their implementation chunk at all. The winner is only decided
 * when something first needs the viewer.
 *
 * @param candidate the offer
 */
export function registerImplementation(candidate: ViewerCandidate): void {
	// Copies within a major are compatible: the newest simply wins and there
	// is nothing to say. Different majors are worth a word, because the apps
	// that pinned them expect behaviour the elected copy may not have
	const clashes = scope.candidates.some((entry) => major(entry.version) !== major(candidate.version))
	if (clashes) {
		const versions = [...new Set([...scope.candidates.map((entry) => entry.version), candidate.version])]
		const winner = [...versions].sort(compareVersions).at(-1)
		logger.warn(
			`Incompatible versions of @nextcloud/viewer are loaded on this page (${versions.join(', ')}). `
			+ `Only ${winner} will be used. Align the majors the apps on this page depend on.`,
			{ versions, winner },
		)
	}

	scope.candidates.push(candidate)
}

/**
 * Load the newest offered implementation, once per page.
 *
 * Newest rather than first-registered: script order across apps is not
 * something anyone controls, so electing the first to arrive would mean
 * the viewer behaves differently depending on which app's bundle
 * happened to load first.
 */
export function loadImplementation(): Promise<unknown> {
	scope.implementation ??= (async () => {
		const [best] = [...scope.candidates].sort((a, b) => compareVersions(b.version, a.version))
		if (best === undefined) {
			throw new Error('No viewer implementation is available on this page')
		}
		return best.load()
	})()
	return scope.implementation
}
