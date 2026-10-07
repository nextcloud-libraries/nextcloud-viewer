/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFile, IFileAction, INode } from '@nextcloud/files'

import FileSvg from '@mdi/svg/svg/file.svg?raw'
import MotionPlaySvg from '@mdi/svg/svg/motion-play-outline.svg?raw'
import OpenInAppSvg from '@mdi/svg/svg/open-in-app.svg?raw'
import { DefaultType, FileType, getFileActions, Permission, registerFileAction } from '@nextcloud/files'
import { scope } from './scope.ts'
import { logger } from './services/logger.ts'
import { openViewer, openWithHistory } from './utils/history.ts'
import { t } from './utils/l10n.ts'

/** Default click-to-open action id */
const ACTION_VIEWER = 'viewer-open'
/** Parent "Open with …" selector menu id */
const ACTION_VIEWER_MENU = 'viewer-open-with'
// Starts with the menu's prefix, so the viewer leaves it out of its own header
const ACTION_SLIDESHOW = 'viewer-open-slideshow'

export interface IHandler {
	/**
	 * Unique identifier for the handler
	 */
	id: string

	/**
	 * The handler translated name
	 */
	displayName: string

	/**
	 * Optional icon for the handler
	 */
	iconSvgInline?: string

	/**
	 * The tag name of the custom element that shows the file.
	 *
	 * The element must be defined under this name with
	 * `CustomElementRegistry.define()`, either when the handler is registered
	 * or within the `onInit` callback (preferred, as it keeps the view out of
	 * the script that runs on every page). With `onInit`, the viewer waits for
	 * the element to be defined (`customElements.whenDefined()`) before
	 * rendering it.
	 *
	 * Custom elements share one registry for the whole page, so to avoid name
	 * clashes the name has to start with your app id (e.g. `your_app`). In
	 * addition to the custom element naming rules (lowercase, with a hyphen),
	 * a good name would be `your_app-viewer-handler`.
	 */
	tagName: string

	/**
	 * Identifier to group handlers by.
	 * When opening a folder we'll check
	 * against all handlers that are enabled
	 * for the given group AND matches the
	 * group property.
	 */
	group?: string

	/**
	 * Is this enabled for the given mimes ?
	 */
	enabled: (nodes: IFile[]) => boolean

	/**
	 * Optional function to preload data for the given node.
	 * This will be called for the previous and next nodes on
	 * opening a file to allow the handler to be faster when navigating.
	 *
	 * @param node - The node to preload data for
	 * @param space - The space the viewer shows files in, in CSS pixels, for
	 *   a handler whose request depends on it, like a preview's size
	 * @param space.width - Its width
	 * @param space.height - Its height
	 * @return A promise that resolves when the data is preloaded
	 */
	preload?: (node: IFile, space?: { width: number, height: number }) => Promise<void>

	/**
	 * Called the first time the viewer needs the element, to define it
	 * (`customElements.define()` with `tagName`).
	 *
	 * The viewer waits for the returned promise and for the element to be
	 * defined (`customElements.whenDefined()`) before rendering it, so the
	 * view and everything it imports stay out of the registration script
	 * that runs on every page. Leave it out when the element is already
	 * defined by the time the viewer opens.
	 */
	onInit?: () => Promise<void>

	/**
	 * Viewer modal theme: 'dark' (the default), 'light', or 'default' to
	 * follow the user's theme
	 */
	theme?: 'dark' | 'light' | 'default'

	/**
	 * Whether this handler supports editing the current file in place.
	 * When true the viewer shows an "Edit" action that toggles the handler's
	 * `editing` prop (e.g. the image editor).
	 */
	canEdit?: boolean

	/**
	 * Whether comparing two versions of a file side by side is worth offering
	 * for this handler's files. It is a hint for callers deciding whether to
	 * offer it at all (see `canCompare()`): `getViewer().compare()` shows any
	 * pair either way.
	 */
	canCompare?: boolean

	/**
	 * Whether this handler works with end-to-end encrypted files.
	 *
	 * End-to-end encrypted files are decrypted when fetched from their
	 * WebDAV endpoint. A handler that fetches the file from a different
	 * endpoint gets ciphertext. Set the property to true if the handler
	 * reads the file from its dav source.
	 */
	supportsEndToEndEncryption?: boolean
}

/** The dav attribute used to flag end-to-end encrypted files */
const ENCRYPTED_ATTRIBUTE = 'e2ee-is-encrypted'

/**
 * Whether the viewer can open the given nodes.
 *
 * Answers what clicking them would do without opening anything, for a
 * caller that has to decide whether to offer the viewer at all — a
 * "View" button in a sidebar, say. Only files are supported, folders
 * never match, and a set of nodes matches when one handler takes all
 * of them.
 *
 * @param nodes - The node, or nodes, to test the handlers against
 */
export function canView(nodes: INode | INode[]): boolean {
	return countEnabledHandlers(Array.isArray(nodes) ? nodes : [nodes], 1)
}

/**
 * Whether comparing two versions of a file is worth offering.
 *
 * For a caller deciding whether to show a "Compare" action, like the
 * versions tab of the Files sidebar: the file has to be viewable, and the
 * handler the viewer would open it with has to say so with `canCompare`.
 *
 * @param node - The file to compare versions of
 */
export function canCompare(node: INode): boolean {
	if (!canView(node)) {
		return false
	}
	// The one the viewer would show it with: the first to take it
	const handler = [...getHandlers().values()].find((candidate) => isHandlerEnabled(candidate, [node as IFile]))
	return handler?.canCompare === true
}

/**
 * Whether a handler accepts the given files.
 *
 * An end-to-end encrypted file goes only to a handler that says it can
 * read one; the others are never asked.
 *
 * A handler is third-party code: one that throws from `enabled()` is
 * reported and treated as not matching, so it cannot break the Files
 * actions or the viewer for every other handler on the page.
 *
 * @param handler - The handler to ask
 * @param nodes - The files to test it against
 */
export function isHandlerEnabled(handler: IHandler, nodes: IFile[]): boolean {
	if (!handler.supportsEndToEndEncryption && nodes.some((node) => Boolean(node.attributes?.[ENCRYPTED_ATTRIBUTE]))) {
		return false
	}
	try {
		return Boolean(handler.enabled(nodes))
	} catch (error) {
		logger.error(`Handler ${handler.id} threw from enabled(), treating it as disabled`, { handler, nodes, error })
		return false
	}
}

/**
 * Whether at least `min` registered handlers can open the given nodes.
 * Only files are supported, folders never match.
 *
 * @param nodes - The nodes to test the handlers against
 * @param min - The minimum number of matching handlers required
 */
function countEnabledHandlers(nodes: INode[], min: number): boolean {
	if (nodes.length === 0 || nodes.some((node) => node.type !== FileType.File)) {
		return false
	}

	// Nothing to show for a file this user cannot read. Deleted files pass
	// this: the trashbin reports them as readable, and previewing them is
	// the point. A node that is not dav-backed always reports readable.
	if (nodes.some((node) => (node.permissions & Permission.READ) === 0)) {
		return false
	}

	let count = 0
	for (const handler of getHandlers().values()) {
		if (isHandlerEnabled(handler, nodes as IFile[])) {
			count++
		}
		if (count >= min) {
			return true
		}
	}
	return false
}

/**
 * Start a slideshow of the files selected in the Files list, which plays the
 * videos among them to their end. Only for a selection of two files or more
 * that can all be viewed: a single file has nothing to step to, and the
 * viewer could not show the rest.
 */
const slideshowAction: IFileAction = {
	id: ACTION_SLIDESHOW,
	displayName: () => t('Start slideshow'),
	iconSvgInline: () => MotionPlaySvg,
	order: -999,

	enabled: ({ nodes }) => nodes.length > 1 && nodes.every((node) => countEnabledHandlers([node], 1)),
	// Only ever offered for a selection
	async exec() {
		return null
	},
	async execBatch({ nodes, view, folder }) {
		// Not through the Files history: a selection is nothing a URL can
		// bring back, and putting each file stepped to in the URL has the
		// Files app open the viewer again on the whole folder
		openViewer(nodes as IFile[], nodes[0] as IFile, { view, folder, startSlideshow: true })
		return nodes.map(() => null)
	},
}

/**
 * Default action, triggered on file click. Opens the viewer with the first
 * matching handler. Hidden from the actions menu to avoid cluttering it, but
 * it is what makes any viewable file open on a single click, regardless of how
 * many handlers are registered.
 */
const defaultViewerAction: IFileAction = {
	id: ACTION_VIEWER,
	displayName: () => t('View'),
	iconSvgInline: () => OpenInAppSvg,
	order: -1000,
	default: DefaultType.DEFAULT,

	enabled: ({ nodes }) => countEnabledHandlers(nodes, 1),
	async exec({ nodes, contents, view, folder }) {
		if (nodes[0]?.type !== FileType.File) {
			return null
		}

		openWithHistory(contents as IFile[], nodes[0] as IFile, view, folder)
		return null
	},
}

/**
 * Parent "Open with …" menu. Only shown when more than one handler can open
 * the given nodes, so the user is offered a real choice between them.
 */
const openWithViewerAction: IFileAction = {
	id: ACTION_VIEWER_MENU,
	displayName: () => t('Open with …'),
	iconSvgInline: () => OpenInAppSvg,
	order: -999,

	enabled: ({ nodes }) => countEnabledHandlers(nodes, 2),
	exec() {
		return Promise.resolve(null)
	},
}

/**
 * Register a new handler for the viewer.
 * This needs to be called before the viewer is initialized to ensure the handler is available.
 * So this should be called from an initialization script (`OCP\Util::addInitScript`).
 *
 * @param handler - The handler to register
 * @throws {Error} if the handler is invalid
 */
export function registerHandler(handler: IHandler): void {
	validateHandler(handler)

	// The shared actions, each by its own id: a copy of an older version may
	// have registered the ones it knew of, and a newer one still adds those it
	// did not. Ahead of the check below, as that copy has usually registered
	// the default handlers too, which this one then leaves to it.
	const registeredActions = new Set(getFileActions().map((action) => action.id))
	for (const action of [defaultViewerAction, openWithViewerAction, slideshowAction]) {
		if (!registeredActions.has(action.id)) {
			registerFileAction(action)
			logger.info('Registered viewer file action', { id: action.id })
		}
	}

	scope.handlers ??= new Map<string, IHandler>()
	const registered = scope.handlers.get(handler.id)
	if (registered !== undefined) {
		// Every app bundles its own copy of the package, so the same handler
		// can be registered more than once: the server's copy and an app's
		// both register the defaults. The first one stays, as the custom
		// element its tagName names is the first copy's too.
		if (registered.tagName === handler.tagName) {
			logger.debug(`Handler ${handler.id} is already registered, keeping the first registration`)
		} else {
			logger.warn(`Handler with id ${handler.id} is already registered for <${registered.tagName}>, ignoring the one for <${handler.tagName}>.`)
		}
		return
	}

	scope.handlers.set(handler.id, handler)

	// Selector entry shown under the "Open with …" menu. Opening forces this
	// specific handler regardless of registration order.
	registerFileAction({
		id: `${ACTION_VIEWER_MENU}-${handler.id}`,
		// TRANSLATORS: handler is the translated name of the handler.
		displayName: () => t('Open with {handler}', { handler: handler.displayName }),

		iconSvgInline: () => handler.iconSvgInline ?? FileSvg,
		parent: ACTION_VIEWER_MENU,
		order: -999,

		enabled: ({ nodes }) => {
			if (nodes.length === 0 || nodes.some((node) => node.type !== FileType.File)) {
				return false
			}

			return isHandlerEnabled(handler, nodes as IFile[])
		},
		async exec({ nodes, contents, view, folder }) {
			if (nodes[0]?.type !== FileType.File) {
				return null
			}

			openWithHistory(contents as IFile[], nodes[0] as IFile, view, folder, handler.id)
			return null
		},
	})
}

/**
 * Get all registered handlers.
 */
export function getHandlers(): Map<string, IHandler> {
	return scope.handlers ??= new Map<string, IHandler>()
}

/**
 * Validate the handler object.
 *
 * @param handler - The handler to validate
 */
function validateHandler(handler: IHandler): void {
	const { id, displayName, group, enabled } = handler
	if (typeof id !== 'string' || id.trim() === '') {
		throw new Error('Handler id must be a non-empty string')
	}

	if (typeof displayName !== 'string' || displayName.trim() === '') {
		throw new Error('Handler displayName must be a non-empty string')
	}

	if (typeof handler.tagName !== 'string' || handler.tagName.trim() === '') {
		throw new Error('Handler tagName must be a non-empty string')
	}

	if (group && (typeof group !== 'string' || group.trim() === '')) {
		throw new Error('Handler group must be a non-empty string if provided')
	}

	if (typeof enabled !== 'function') {
		throw new Error('Handler enabled must be a function')
	}

	if (handler.preload && typeof handler.preload !== 'function') {
		throw new Error('Handler preload must be a function if provided')
	}

	if (handler.onInit && typeof handler.onInit !== 'function') {
		throw new Error('Handler onInit must be a function if provided')
	}

	if (handler.theme && !['dark', 'light', 'default'].includes(handler.theme)) {
		throw new Error("Handler theme must be one of 'dark', 'light', 'default' if provided")
	}

	validateCustomElementName(handler.tagName)
}

/**
 * Validate that the given tag name is a valid custom element name.
 *
 * @param tagName - The custom element tag name to validate
 */
function validateCustomElementName(tagName: string): void {
	if (!tagName.includes('-')) {
		throw new Error('Handler tagName must contain a hyphen (-)')
	}
	if (/^[A-Z]/.test(tagName)) {
		throw new Error('Handler tagName must not start with an uppercase letter')
	}
	if (/--/.test(tagName)) {
		throw new Error('Handler tagName must not contain consecutive hyphens (--)')
	}
	if (tagName.startsWith('-') || tagName.endsWith('-')) {
		throw new Error('Handler tagName must not start or end with a hyphen (-)')
	}
	if (!/^[a-z][a-z0-9_-]*$/.test(tagName)) {
		throw new Error('Handler tagName must only contain lowercase letters, numbers, underscores (_) and hyphens (-)')
	}
}
