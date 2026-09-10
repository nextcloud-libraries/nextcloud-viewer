<!--
  - SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<!-- Only render while a file is shown: the modal is teleported to the body
	     and keeps exposing a `dialog` role to assistive technology otherwise. -->
	<NcModal
		v-if="!!currentFile || !!errorString"
		ref="modal"
		:additionalTrapElements="trapElements"
		:clearViewDelay="-1 /* disable fade-out because of accessibility reasons */"
		:closeButtonOutside="true"
		:dark="true"
		:data-handler="currentHandler?.id"
		:disableSwipe="!canSwipe || editing"
		:enableSlideshow="!isComparing && (hasPrevious || hasNext)"
		:hasNext="!isComparing && hasNext"
		:hasPrevious="!isComparing && hasPrevious"
		:inlineActions="canEdit ? 1 : 0"
		:lightBackdrop="lightBackdrop"
		:name="modalName"
		:show="!!currentFile"
		:slideshowPaused="editing"
		:spreadNavigation="true"
		:style="{ width: isSidebarShown ? `${sidebarPosition}px` : null }"
		class="viewer__modal"
		size="full"
		@close="close"
		@previous="previous"
		@next="next">
		<!-- Header actions -->
		<template #actions>
			<!-- Internal edit action, handled by the handler itself -->
			<NcActionButton
				v-if="canEdit && !editing"
				closeAfterClick
				@click="editing = true">
				<template #icon>
					<PencilIcon :size="20" />
				</template>
				{{ t('Edit') }}
			</NcActionButton>

			<!-- Full screen, which is the point of a viewer on a large photo -->
			<NcActionButton
				closeAfterClick
				@click="toggleFullScreen">
				<template #icon>
					<FullscreenExitIcon v-if="isFullscreen" :size="20" />
					<FullscreenIcon v-else :size="20" />
				</template>
				{{ isFullscreen ? t('Exit full screen') : t('Full screen') }}
			</NcActionButton>

			<!-- Open sidebar for the current file -->
			<NcActionButton
				v-if="!isSidebarShown && !!currentFile && canOpenSidebar"
				closeAfterClick
				@click="showSidebar">
				<template #icon>
					<DockRight :size="20" />
				</template>
				{{ t('Open sidebar') }}
			</NcActionButton>

			<!-- Files actions available for the current file (download, delete, …).
			     Top-level actions, unless a submenu (e.g. "Set reminder") is open. -->
			<template v-if="!openedSubmenu">
				<NcActionButton
					v-for="action in fileActions"
					:key="action.id"
					:isMenu="isValidMenu(action)"
					:closeAfterClick="!isValidMenu(action)"
					@click="onActionClick(action)">
					<template #icon>
						<NcIconSvgWrapper :svg="actionIcon(action)" :size="20" />
					</template>
					{{ actionLabel(action) }}
				</NcActionButton>
			</template>

			<!-- Open submenu: a back entry followed by the parent's children -->
			<template v-else>
				<NcActionButton @click="onBackToMenuClick">
					<template #icon>
						<ChevronLeft :size="20" />
					</template>
					{{ actionLabel(openedSubmenu) }}
				</NcActionButton>
				<NcActionButton
					v-for="action in enabledSubmenuActions[openedSubmenu.id]"
					:key="action.id"
					closeAfterClick
					@click="handleAction(action)">
					<template #icon>
						<NcIconSvgWrapper :svg="actionIcon(action)" :size="20" />
					</template>
					{{ actionLabel(action) }}
				</NcActionButton>
			</template>
		</template>

		<!-- Loading overlay, shown on top of the (mounted but hidden) handler -->
		<span v-if="loading && !errorString" class="viewer__loading">
			<NcLoadingIcon :appearance="lightBackdrop ? 'dark' : 'light'" :size="32" />
		</span>

		<!-- Error message -->
		<NcEmptyContent
			v-else-if="errorString"
			:name="errorString"
			:description="t('We were unable to display the requested file.')">
			<template #icon>
				<FileAlertOutlineIcon />
			</template>
		</NcEmptyContent>

		<!--
			The handler is always mounted while a file is set (only hidden with
			v-show while loading or on error) so that it can actually load and
			emit its `loaded` event. It must not share the v-if chain with the
			loading spinner, otherwise it would never mount and never load.
		-->
		<!-- Comparison of two files, rendered side by side -->
		<div
			v-if="isComparing"
			v-show="!loading && !errorString"
			class="viewer__comparison">
			<!-- The handlers are custom elements: they observe hyphenated
			     attributes, so camelCase bindings are lost whenever the element
			     is patched before it upgrades. -->
			<!-- eslint-disable vue/attribute-hyphenation -->
			<component
				:is="currentHandler?.tagname"
				v-if="currentFile"
				:file="currentFile"
				:files="[]"
				:is-sidebar-shown="isSidebarShown"
				:max-height="height"
				:max-width="width / 2"
				:editing="false"
				@loaded="onLoad"
				@errored="onError" />
			<component
				:is="comparisonHandler?.tagname"
				v-if="comparisonFile"
				:file="comparisonFile"
				:files="[]"
				:is-sidebar-shown="isSidebarShown"
				:max-height="height"
				:max-width="width / 2"
				:editing="false"
				@loaded="onLoad"
				@errored="onError" />
		</div>

		<!-- Single file view -->
		<component
			:is="currentHandler?.tagname"
			v-else-if="currentFile"
			v-show="!loading && !errorString"
			:key="`${currentFile.fileid}-${reloadKey}`"
			ref="handlerElement"
			:can-swipe="canSwipe"
			:file="currentFile"
			:files="currentFileList"
			:is-sidebar-shown="isSidebarShown"
			:max-height="height"
			:max-width="width"
			:editing="editing"
			:local-source="editedSources[currentFile.fileid!]"
			@loaded="onLoad"
			@errored="onError" />
		<!-- eslint-enable vue/attribute-hyphenation -->
	</NcModal>

	<!-- Editing overlay, rendered at the viewer level (not inside the handler
	     custom element) so its close/save events reach the viewer directly. -->
	<ImageEditor
		v-if="editing && currentFile && canEdit"
		:file="currentFile"
		@saved="onEditSaved"
		@close="editing = false" />

	<!-- In-viewer rename dialog: the Files rename action edits the file-list row,
	     which the viewer does not host, so we rename here instead. -->
	<NcDialog
		:open="renameDialogOpen"
		:name="t('Rename file')"
		size="small"
		:buttons="renameButtons"
		@update:open="renameDialogOpen = $event">
		<form @submit.prevent="submitRename">
			<NcTextField
				v-model="renameValue"
				:label="t('New name')"
				labelVisible />
		</form>
	</NcDialog>
</template>

<script setup lang="ts">
import type { IFile, IFolder, INode, IView } from '@nextcloud/files'
import type { IFileAction } from '@nextcloud/files'
import type { IHandler } from '../handlers.ts'
import type { ViewerAPI, ViewerOptions } from '../viewer.ts'

import { showError } from '@nextcloud/dialogs'
import { emit, subscribe, unsubscribe } from '@nextcloud/event-bus'
import { FileType, Permission } from '@nextcloud/files'
import debounce from 'debounce'
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, triggerRef, useTemplateRef, watch } from 'vue'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcModal from '@nextcloud/vue/components/NcModal'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import ChevronLeft from 'vue-material-design-icons/ChevronLeft.vue'
import DockRight from 'vue-material-design-icons/DockRight.vue'
import FileAlertOutlineIcon from 'vue-material-design-icons/FileAlertOutline.vue'
import FullscreenIcon from 'vue-material-design-icons/Fullscreen.vue'
import FullscreenExitIcon from 'vue-material-design-icons/FullscreenExit.vue'
import PencilIcon from 'vue-material-design-icons/Pencil.vue'
import { useViewerActions } from '../composables/useViewerActions.ts'
import { getHandlers, isHandlerEnabled } from '../handlers.ts'
import { getHandlerForFile } from '../helpers/handlerHelper.ts'
import { fetchFolderContent } from '../services/dav.ts'
import { logger } from '../services/logger.ts'
import { canDownload } from '../utils/canDownload.ts'
import { restoreTitle, setViewerTitle } from '../utils/documentTitle.ts'
import { emittedValue, toError } from '../utils/handlerEvents.ts'
import { t } from '../utils/l10n.ts'
import { renameFile } from '../utils/rename.ts'

defineOptions({ name: 'ViewerModal' })

// The image editor is a large, canvas-based dependency; load it only when needed.
const ImageEditor = defineAsyncComponent(() => import('../components/ImageEditor.vue'))

let resizeObserver = null as ResizeObserver | null
// $el is only an element while the modal is shown, a comment node otherwise.
const modal = useTemplateRef<{ $el: Node }>('modal')
const height = ref(0)
const width = ref(0)

// State
const loading = ref(true)
const errorString = ref<string | null>(null)
// Number of handler components still loading before the spinner is hidden.
// 1 for a normal open, 2 while comparing two files side by side.
const pendingLoads = ref(0)
// Bumped to force the current handler to remount (e.g. after an edit save).
const reloadKey = ref(0)
// Object URLs of freshly edited images, by file id, shown without refetching.
const editedSources = ref<Record<number, string>>({})

const canSwipe = ref(true)
const isFullscreen = ref(false)
const editing = ref(false)
const lightBackdrop = ref(false)

// Sidebar handling
const sidebarPosition = ref(0)
const isSidebarShown = computed(() => sidebarPosition.value > 0)
const trapElements = ref<HTMLElement[]>([])
/** Body class that expands the Files sidebar to full height next to the viewer. */
const SIDEBAR_FULLSCREEN_CLASS = 'viewer--sidebar-fullscreen'

// Current context
const currentFile = ref<IFile>()
const currentFileList = ref<IFile[]>([])
const currentHandler = ref<IHandler>()

/**
 * The handler the opener asked for by id, if it did.
 *
 * Kept for as long as the viewer stays on that list, because
 * `getHandlerForFile` answers with the first handler that takes a file,
 * which is not the one that was asked for.
 */
const forcedHandler = ref<IHandler>()

/**
 * The handler a file is shown with: the forced one for as long as it takes
 * the file, and otherwise the first handler that does.
 *
 * @param file - The file to be shown
 */
function handlerFor(file: IFile): IHandler | undefined {
	if (forcedHandler.value !== undefined && isHandlerEnabled(forcedHandler.value, [file])) {
		return forcedHandler.value
	}
	return getHandlerForFile(file)
}

/**
 * Whether the viewer offers to edit the current file.
 *
 * Both halves matter: the handler has to be able to edit its own file type,
 * and the file has to be one this user may write. Offering it on a file that
 * cannot be written means an edit that only fails on save.
 */
const canEdit = computed(() => currentHandler.value?.canEdit === true
	&& ((currentFile.value?.permissions ?? Permission.NONE) & Permission.UPDATE) !== 0)
const currentOptions = ref<ViewerOptions>({
	canLoop: true,
	enableSidebar: true,
	onClose: () => {},
	onNext: () => {},
	onPrev: () => {},
	loadMore: () => Promise.resolve([]),
})

// The sidebar resolves a file by its dav source, so it can only be offered
// for a file the Files app can find there.
const canOpenSidebar = computed(() => currentOptions.value.enableSidebar !== false)

// Comparison context (compare API)
const comparisonFile = ref<IFile>()
const comparisonHandler = ref<IHandler>()
const isComparing = computed(() => !!comparisonFile.value)

// Files actions rendered in the viewer menu (download, delete, …), linked to
// the Files actions and run with the view/folder forwarded by the opener.
const { actions: fileActions, enabledSubmenuActions, isValidMenu, actionLabel, actionIcon, execAction } = useViewerActions(
	() => currentFile.value as IFile | undefined,
	() => currentFileList.value as IFile[],
	() => currentOptions.value.view as IView | undefined,
	() => currentOptions.value.folder as IFolder | undefined,
)

// The parent action whose submenu is currently open in the menu, if any.
const openedSubmenu = ref<IFileAction | null>(null)

// Stable Files action ids the viewer handles itself instead of delegating,
// because their default UI lives on the (hidden) file-list row.
const RENAME_ACTION_ID = 'rename'

// Rename dialog state
const renameDialogOpen = ref(false)
const renameValue = ref('')

/**
 * Handle a click on a menu action: open its submenu if it has one, otherwise
 * run it.
 *
 * @param action - The clicked file action
 */
function onActionClick(action: IFileAction) {
	if (isValidMenu(action)) {
		openedSubmenu.value = action
		return
	}
	handleAction(action)
}

/**
 * Go back from a submenu to the top-level menu.
 */
function onBackToMenuClick() {
	openedSubmenu.value = null
}

/**
 * Run a viewer menu action. The rename action is intercepted and handled with
 * an in-viewer dialog; everything else is delegated to the Files action.
 *
 * @param action - The file action to run
 */
function handleAction(action: IFileAction) {
	openedSubmenu.value = null
	if (action.id === RENAME_ACTION_ID) {
		openRenameDialog()
		return
	}
	execAction(action)
}

const renameButtons = computed(() => [
	{
		label: t('Cancel'),
		callback: () => {
			renameDialogOpen.value = false
		},
	},
	{
		label: t('Rename'),
		variant: 'primary' as const,
		callback: submitRename,
	},
])

/**
 * Open the rename dialog prefilled with the current file name.
 */
function openRenameDialog() {
	if (!currentFile.value) {
		return
	}
	renameValue.value = currentFile.value.basename
	renameDialogOpen.value = true
}

/**
 * Perform the rename of the current file.
 */
async function submitRename() {
	const file = currentFile.value
	if (!file) {
		return
	}
	try {
		await renameFile(file, renameValue.value)
		// The node is mutated in place; force the header/name to re-read it.
		triggerRef(currentFile)
		triggerRef(currentFileList)
		renameDialogOpen.value = false
	} catch (error) {
		showError((error as Error).message)
	}
}

/**
 * When a file is deleted (by the delete action or elsewhere), drop it from the
 * viewer list and move to the next file, then the previous, then close if the
 * list is now empty.
 *
 * @param node - The deleted node
 */
function onNodeDeleted(node: INode) {
	const index = currentFileList.value.findIndex((file) => file.fileid === node.fileid || file.source === node.source)
	if (index === -1) {
		return
	}

	const wasCurrent = currentFileList.value[index]?.fileid === currentFile.value?.fileid
	currentFileList.value = currentFileList.value.filter((_, i) => i !== index)

	if (!wasCurrent) {
		return
	}

	if (currentFileList.value.length === 0) {
		close()
		return
	}

	// Same index now points to the former next file; clamp to the last one when
	// the deleted file was at the end (i.e. fall back to the previous file).
	const newFile = currentFileList.value[Math.min(index, currentFileList.value.length - 1)] as IFile
	currentHandler.value = handlerFor(newFile)
	currentFile.value = newFile
	preloadNeighbors()
}

/**
 * When the shown file is updated (e.g. saved from the image editor), remount the
 * handler so it re-reads the node and shows the new content.
 *
 * @param node - The updated node
 */
function onNodeUpdated(node: INode) {
	// A freshly edited file is already shown from its local blob; do not refetch.
	if (node.fileid !== undefined && editedSources.value[node.fileid]) {
		return
	}
	if (node.fileid === currentFile.value?.fileid) {
		reloadKey.value++
	}
}

/**
 * Show a just-saved edited image from its local object URL (no server refetch).
 *
 * @param source - The edited image as an object URL
 */
function onEditSaved(source: string) {
	const fileid = currentFile.value?.fileid
	if (fileid === undefined) {
		return
	}
	// Release a previous edit of the same file before replacing it.
	const previous = editedSources.value[fileid]
	if (previous) {
		URL.revokeObjectURL(previous)
	}
	editedSources.value = { ...editedSources.value, [fileid]: source }
}

/**
 * Release every edited-image object URL and clear the map.
 */
function clearEditedSources() {
	for (const url of Object.values(editedSources.value)) {
		URL.revokeObjectURL(url)
	}
	editedSources.value = {}
}

/**
 * Set the editing state, used to sync the viewer with the `editing` URL param
 * (e.g. on browser back/forward). Only handlers that support editing can enter it.
 *
 * @param value - Whether the viewer should be in editing mode
 */
function setEditing(value: boolean) {
	editing.value = value && canEdit.value
}

// Reflect editing changes (Edit button, editor save/cancel) in the URL so a
// refresh reopens in the same state.
// Synchronous so leaving editing on close still reaches the opener, before
// close() drops the options.
watch(editing, (value) => {
	currentOptions.value.onEditingChange?.(value)
}, { flush: 'sync' })

const modalName = computed(() => {
	if (isComparing.value) {
		return t('Comparing {file1} and {file2}', {
			file1: currentFile.value?.displayname ?? '',
			file2: comparisonFile.value?.displayname ?? '',
		})
	}
	return currentFile.value?.displayname || ''
})

const hasNext = computed(() => {
	const canLoop = currentOptions.value.canLoop ?? true
	const currentIndex = currentFileList.value.findIndex((f) => f === currentFile.value)
	if (currentIndex === -1) {
		return false
	}

	// If we are not allowed to loop and we are at the end,
	// we cannot go next
	if (currentIndex < currentFileList.value.length - 1) {
		return true
	}

	// If we are allowed to loop and we are at the end,
	// we can go next if there is more than one file
	if (canLoop && currentIndex === currentFileList.value.length - 1 && currentFileList.value.length > 1) {
		return true
	}

	return false
})
const hasPrevious = computed(() => {
	const canLoop = currentOptions.value.canLoop ?? true
	const currentIndex = currentFileList.value.findIndex((f) => f === currentFile.value)
	if (currentIndex === -1) {
		return false
	}

	// If we are not allowed to loop and we are at the start,
	// we cannot go previous
	if (currentIndex > 0) {
		return true
	}

	// If we are allowed to loop and we are at the start,
	// we can go previous if there is more than one file
	if (canLoop && currentIndex === 0 && currentFileList.value.length > 1) {
		return true
	}

	return false
})

const open: ViewerAPI['open'] = async (files, file, options, handlerId) => {
	logger.debug('Opening files', { files, file, options, handlerId })

	// Filter out any non-file files
	files = files.filter((n) => n.type === FileType.File)

	// Ensure we have at least one file to open
	if (files.length === 0 && !file) {
		logger.error('No files provided to open')
		errorString.value = t('No files were provided to open.')
		return
	}

	if (handlerId && !getHandlers().has(handlerId)) {
		logger.error('There is no handler matching the given handler ID')
		errorString.value = t('There was no plugin available to open this file.')
		return
	}

	// Slight adjustment: if there is a mismatch between
	// the provided file and the list of files
	if (!file) {
		file = files[0]
	} else if (!files.includes(file)) {
		files = [file, ...files]
	}

	// Last check, we need to have something to open
	if (!file) {
		logger.error('No file provided to open')
		errorString.value = t('No files were provided to open.')
		return
	}

	const handler = handlerId ? getHandlers().get(handlerId) : getHandlerForFile(file)
	if (!handler) {
		logger.error('No handler found for the given file', { file, files })
		errorString.value = t('There was no plugin available to open this file.')
		return
	}

	forcedHandler.value = handlerId ? handler : undefined

	/**
	 * Let's compute the current file list based on the current handler
	 * and its group. We only want to show files that can be handled
	 * by the same handler or handlers from the same group.
	 */
	currentFileList.value = files.filter((f) => {
		const h = handlerFor(f)
		if (h === undefined) {
			return false
		}
		// Only group handlers that actually declare one, otherwise every handler
		// without a group would be considered part of the same one.
		return h.id === handler.id || (handler.group !== undefined && h.group === handler.group)
	})

	if (currentFileList.value.length === 0) {
		// Fallback to just the provided file
		currentFileList.value = [file]
	}

	if (currentFileList.value.length !== files.length) {
		logger.debug(`Found ${currentFileList.value.length} files for the current handler/group out of ${files.length} provided files`, {
			filtered: currentFileList.value,
			provided: files,
		})
	}

	// Opening what is already open is not a new load. The Files app asks
	// more than once — clicking a file, and again as the sidebar opens —
	// and the handler keeps the file it already has, so nothing would tell
	// us it had loaded a second time and the spinner would never go away.
	const isSameFile = currentFile.value?.fileid === file.fileid
		&& currentHandler.value?.id === handler.id
		&& comparisonFile.value === undefined

	comparisonFile.value = undefined
	comparisonHandler.value = undefined
	currentHandler.value = handler
	currentFile.value = file
	currentOptions.value = options ?? {} as ViewerOptions
	if (!isSameFile) {
		loading.value = true
		pendingLoads.value = 1
	}
	// A failure to open something else earlier is not this file's problem
	errorString.value = null
	// Open straight into edit mode when requested (e.g. from an `editing=true` URL).
	editing.value = Boolean(options?.editing) && canEdit.value

	onOpen()
	preloadNeighbors()
}

const openFolder: ViewerAPI['openFolder'] = async (folder, file, options, handlerId) => {
	logger.debug('Opening folder', { folder, file, options, handlerId })
	loading.value = true

	if (handlerId && !getHandlers().has(handlerId)) {
		logger.error('There is no handler matching the given handler ID')
		errorString.value = t('We were not able to open the file.')
		return
	}

	if (!folder || folder.type !== FileType.Folder) {
		logger.error('The provided folder is not a directory', { folder })
		errorString.value = t('We were not able to open the file.')
		return
	}

	try {
		const files = await fetchFolderContent(folder)
		return open(files, file, options, handlerId)
	} catch (error) {
		logger.error('Failed to fetch folder contents', { folder, error })
		errorString.value = t('We were not able to open the file.')
		return
	}
}

const compare: ViewerAPI['compare'] = async (file1, file2, handlerId) => {
	logger.debug('Comparing files', { file1, file2, handlerId })
	loading.value = true

	if (handlerId && !getHandlers().has(handlerId)) {
		logger.error('There is no handler matching the given handler ID')
		errorString.value = t('We were not able to open the file.')
		return
	}

	if (!file1 || !file2 || file1.type !== FileType.File || file2.type !== FileType.File) {
		logger.error('Two files are required to compare', { file1, file2 })
		errorString.value = t('We were not able to open the file.')
		return
	}

	const handler1 = handlerId ? getHandlers().get(handlerId) : getHandlerForFile(file1)
	const handler2 = handlerId ? getHandlers().get(handlerId) : getHandlerForFile(file2)
	if (!handler1 || !handler2) {
		logger.error('No handler found for one of the files to compare', { file1, file2 })
		errorString.value = t('There was no plugin available to open this file.')
		return
	}

	// Comparison mode has no navigation, so we reset the slideshow context
	currentFileList.value = []
	forcedHandler.value = undefined
	currentOptions.value = {} as ViewerOptions
	currentHandler.value = handler1
	currentFile.value = file1
	comparisonHandler.value = handler2
	comparisonFile.value = file2
	pendingLoads.value = 2

	onOpen()
}

/**
 * Handle Viewer opening to determine backdrop style.
 *
 * The viewer is dark whatever theme the user runs: a photo or a video reads
 * better against dark, and the room around it should not compete with it.
 * A handler showing something else — a document, say — can ask for a light
 * backdrop instead, but nothing follows the user's theme here.
 */
function onOpen() {
	lightBackdrop.value = (currentHandler.value?.theme ?? 'default') === 'light'
}

/**
 * Preload the previous and next files so navigation feels instant.
 * Uses the handler's optional preload function.
 */
function preloadNeighbors() {
	const currentIndex = currentFileList.value.findIndex((f) => f === currentFile.value)
	if (currentIndex === -1) {
		return
	}

	const neighbors = [
		currentFileList.value[currentIndex - 1],
		currentFileList.value[currentIndex + 1],
	].filter((f): f is IFile => Boolean(f))

	for (const node of neighbors) {
		const handler = handlerFor(node)
		if (!handler?.preload) {
			continue
		}
		// Wrapped so a preload that throws synchronously, or returns no promise,
		// is a logged failure of the handler and not of the open
		Promise.resolve().then(() => handler.preload!(node)).catch((error) => {
			logger.debug('Failed to preload neighbor file', { node, error })
		})
	}
}

/**
 * Handle successful loading of the current file
 * This is emitted by the handler web component
 */
function onLoad() {
	errorString.value = null
	pendingLoads.value = Math.max(0, pendingLoads.value - 1)
	if (pendingLoads.value === 0) {
		loading.value = false
	}
}

/**
 * Handle error while loading the current file
 * This is emitted by the handler web component
 *
 * @param reported What the handler emitted: the event, or the error itself
 */
function onError(reported: unknown) {
	const error = toError(emittedValue(reported), t('An unknown error occurred while loading the file.'))
	logger.error('Error while loading file in viewer', { error })
	loading.value = false
	pendingLoads.value = 0
	errorString.value = error.message
}

// `update:canSwipe` and `update:editing` are bound by hand rather than with
// v-on. A handler is a custom element, so its emits leave as DOM events under
// the name it declared, while v-on hyphenates the listener it is given
// (`update:canSwipe` becomes `update:can-swipe`) and then matches nothing.
const handlerElement = useTemplateRef<HTMLElement>('handlerElement')

watch(handlerElement, (element, previous) => {
	if (previous) {
		previous.removeEventListener('update:canSwipe', onCanSwipe)
		previous.removeEventListener('update:editing', onHandlerEditing)
	}
	if (element) {
		element.addEventListener('update:canSwipe', onCanSwipe)
		element.addEventListener('update:editing', onHandlerEditing)
	}
})

/**
 * A handler reporting whether the viewer may swipe to the next file. Handlers
 * with their own gestures, such as the video controls, turn it off.
 *
 * @param reported - What the handler emitted
 */
function onCanSwipe(reported: unknown) {
	// Anything but an explicit false leaves swiping on, so a handler emitting
	// nothing cannot trap the user on one file.
	canSwipe.value = emittedValue<boolean>(reported) !== false
}

/**
 * A handler reporting that it left, or entered, editing mode by itself.
 *
 * @param reported - What the handler emitted
 */
function onHandlerEditing(reported: unknown) {
	setEditing(emittedValue<boolean>(reported) === true)
}

/**
 * Close the viewer and reset state
 */
function close() {
	// Leave editing first so its URL param is stripped while onEditingChange is
	// still wired (before currentOptions is reset below).
	editing.value = false
	restoreTitle()
	if (document.fullscreenElement) {
		document.exitFullscreen().catch(() => {
			// Nothing to do: the page is simply left as the browser has it
		})
	}
	currentOptions.value.onClose?.()
	currentFile.value = undefined
	currentFileList.value = []
	currentHandler.value = undefined
	forcedHandler.value = undefined
	comparisonFile.value = undefined
	comparisonHandler.value = undefined
	currentOptions.value = {} as ViewerOptions
	errorString.value = null
	// Reset transient UI state so it never leaks into the next open
	loading.value = true
	canSwipe.value = true
	pendingLoads.value = 0
	openedSubmenu.value = null
	clearEditedSources()
	// Restore the app header when closing (the sidebar may still be open).
	document.body.classList.remove(SIDEBAR_FULLSCREEN_CLASS)
}

/**
 * Go to the next file in the list if possible
 */
async function next() {
	const canLoop = currentOptions.value.canLoop ?? true
	const currentIndex = currentFileList.value.findIndex((f) => f === currentFile.value)
	let newIndex = currentIndex + 1

	if (currentIndex === -1) {
		logger.error('Current file not found in the file list', { currentFile: currentFile.value, fileList: currentFileList.value })
		return
	}

	// If we are not allowed to loop and we are at the end, do nothing
	if (!canLoop && currentIndex >= currentFileList.value.length - 1) {
		// We are at the end and cannot loop, do nothing
		return
	}

	// If we are allowed to loop and we are at the end, go to the start
	if (canLoop && newIndex >= currentFileList.value.length) {
		newIndex = 0
	}

	const newFile = currentFileList.value[newIndex] as IFile
	// Should not happen™, but just in case
	if (!newFile) {
		logger.error('Next file not found in the file list', { newIndex, fileList: currentFileList.value })
		return
	}

	currentHandler.value = handlerFor(newFile)
	currentFile.value = newFile
	currentOptions.value.onNext?.(newFile)

	// If we are at the end of the list, try to load more files if possible
	if (newIndex === currentFileList.value.length - 1) {
		try {
			const moreFiles = await currentOptions.value.loadMore?.() ?? []
			if (moreFiles.length > 0) {
				currentFileList.value = currentFileList.value.concat(moreFiles)
			}
		} catch (error) {
			logger.error('Failed to load more files', { error })
		}
	}

	preloadNeighbors()
}

/**
 * Go to the previous file in the list if possible
 */
function previous() {
	const canLoop = currentOptions.value.canLoop ?? true
	const currentIndex = currentFileList.value.findIndex((f) => f === currentFile.value)
	let newIndex = currentIndex - 1

	if (currentIndex === -1) {
		logger.error('Current file not found in the file list', { currentFile: currentFile.value, fileList: currentFileList.value })
		return
	}

	// If we are not allowed to loop and we are at the start, do nothing
	if (!canLoop && currentIndex <= 0) {
		// We are at the start and cannot loop, do nothing
		return
	}

	// If we are allowed to loop and we are at the start, go to the end
	if (canLoop && newIndex < 0) {
		newIndex = currentFileList.value.length - 1
	}

	const newFile = currentFileList.value[newIndex] as IFile
	// Should not happen™, but just in case
	if (!newFile) {
		logger.error('Previous file not found in the file list', { newIndex, fileList: currentFileList.value })
		return
	}

	currentHandler.value = handlerFor(newFile)
	currentFile.value = newFile
	currentOptions.value.onPrev?.(newFile)

	preloadNeighbors()
}

/**
 * Show an already-loaded file by its id without firing navigation callbacks.
 * Used to sync the viewer to the browser history (back/forward) so the opener
 * never pushes a new history entry for a move it triggered itself.
 *
 * @param fileid - The id of the file to show
 */
function goTo(fileid: number) {
	const newFile = currentFileList.value.find((f) => f.fileid === fileid)
	if (!newFile) {
		logger.warn('Cannot go to file, not in the current list', { fileid })
		return
	}
	if (newFile === currentFile.value) {
		return
	}

	currentHandler.value = handlerFor(newFile)
	currentFile.value = newFile
	preloadNeighbors()
}

/**
 * Open the Files sidebar for the current file.
 */
function showSidebar() {
	if (!currentFile.value) {
		return
	}

	// The Files app sidebar store subscribes to this event and opens
	// the sidebar for the file identified by its dav source.
	emit('viewer:sidebar:open', { source: currentFile.value.source })
}

/**
 * Handle app sidebar opening to adjust viewer size
 */
function onAppSidebarOpen() {
	const sidebar = document.querySelector('aside.app-sidebar')
	if (sidebar) {
		sidebarPosition.value = sidebar.getBoundingClientRect().left
		trapElements.value = [sidebar as HTMLElement]
	}
	// Only expand the sidebar to full height when the viewer is actually open;
	// the sidebar is also opened from the plain files list, where the app header
	// must stay visible.
	if (currentFile.value) {
		document.body.classList.add(SIDEBAR_FULLSCREEN_CLASS)
	}
}

/**
 * Reset viewer size to default when app sidebar is closed
 */
function onAppSidebarClose() {
	sidebarPosition.value = 0
	trapElements.value = []
	document.body.classList.remove(SIDEBAR_FULLSCREEN_CLASS)
}

/**
 * Close viewer when clicking outside of the modal content
 *
 * @param event The mouse event
 */
/**
 * The modal root, or null while the viewer shows no file.
 *
 * The modal renders a comment placeholder rather than an element as long as it
 * is hidden, so every lookup below it has to be guarded.
 */
function modalElement(): Element | null {
	const element = modal.value?.$el
	if (element instanceof Element) {
		return element
	}

	// The modal teleports its content to the body, leaving a comment behind as
	// `$el`, so fall back to looking the modal up by its class.
	return document.querySelector('.viewer__modal')
}

/**
 * Close viewer when clicking outside of the modal content
 *
 * @param event The mouse event
 */
function onClickOutside(event: Event) {
	// check if we clicked on the modal container directly and not on its children
	const content = modalElement()?.querySelector('.modal-container__content')
	if (event.target === content) {
		logger.debug('Clicked outside the viewer, closing viewer')
		close()
	}
}

/**
 * Update viewer dimensions on window resize
 */
function onViewerResize() {
	const modalContainer = modalElement()?.querySelector('.modal-container')
	height.value = modalContainer?.clientHeight || 0
	width.value = modalContainer?.clientWidth || 0
	logger.debug('Screen resized, updating viewer dimensions', { height: height.value, width: width.value })
}

/**
 * Measure the viewer once the modal container has been laid out.
 *
 * The container is only inserted after the modal root, so the first
 * measurement can still be zero - and the root covers the window from the
 * start, so observing it reports no resize to correct that later.
 *
 * @param {number} attempt - How many frames we already waited for a layout
 */
function measureModal(attempt = 0) {
	onViewerResize()
	if (width.value === 0 && attempt < 10) {
		requestAnimationFrame(() => measureModal(attempt + 1))
	}
}

/** The modal content the outside-click handler is bound to, while shown. */
let modalContent: Element | null = null

/**
 * Observe the modal and listen for clicks outside of the media.
 *
 * The modal only renders an element while a file is shown, so this runs on
 * every open instead of on mount.
 */
function attachModal() {
	const element = modalElement()
	if (element === null) {
		return
	}

	resizeObserver?.observe(element)
	modalContent = element.querySelector('.modal-container__content')
	modalContent?.addEventListener('click', onClickOutside)
	modalContent?.addEventListener('contextmenu', onContextMenu)
	logger.debug('Resize observer initialized for viewer')
}

/**
 * Toggle full screen.
 *
 * The whole document goes full screen rather than the modal, as the viewer
 * covers the page anyway and the browser's own chrome is what is in the way.
 */
async function toggleFullScreen() {
	if (document.fullscreenElement) {
		await document.exitFullscreen()
		return
	}
	await document.documentElement.requestFullscreen()
}

/**
 * Track full screen, which the user can also leave with Escape or the
 * browser's own control rather than the action.
 */
function onFullscreenChange() {
	isFullscreen.value = document.fullscreenElement !== null
}

/**
 * Refuse the context menu over a file that may not be downloaded.
 *
 * Hiding the download control is not enough on its own: the file is on
 * screen, and the browser's own menu offers to save it. A share that
 * forbids downloading should not be worked around with a right click.
 *
 * @param event the context menu event
 */
function onContextMenu(event: Event) {
	if (currentFile.value && !canDownload(currentFile.value)) {
		event.preventDefault()
	}
}

/**
 * Release what attachModal() registered.
 */
function detachModal() {
	resizeObserver?.disconnect()
	modalContent?.removeEventListener('click', onClickOutside)
	modalContent?.removeEventListener('contextmenu', onContextMenu)
	modalContent = null
}

// Listen to Viewer file changes to trigger resize
watch(currentFile, async (newFile, oldFile) => {
	// A submenu belongs to the previous file's action set; never carry it over.
	openedSubmenu.value = null
	// Here rather than on open, so paging to the next file retitles the page too
	if (newFile) {
		setViewerTitle(newFile.displayname)
	}
	if (newFile && !oldFile) {
		await nextTick()
		attachModal()
		measureModal()
	} else if (!newFile) {
		detachModal()
	}
})

onMounted(() => {
	resizeObserver = new ResizeObserver(debounce(() => {
		onViewerResize()
	}, 100))

	// Covers a viewer that is already showing a file on mount, e.g. a deep link.
	attachModal()

	document.addEventListener('fullscreenchange', onFullscreenChange)

	// React to the Files app sidebar to resize the viewer accordingly
	subscribe('files:sidebar:opened', onAppSidebarOpen)
	subscribe('files:sidebar:closed', onAppSidebarClose)

	// Advance the viewer when the shown file is deleted (from the menu or elsewhere)
	subscribe('files:node:deleted', onNodeDeleted)
	subscribe('files:node:updated', onNodeUpdated)
})

onUnmounted(() => {
	detachModal()
	document.removeEventListener('fullscreenchange', onFullscreenChange)
	unsubscribe('files:sidebar:opened', onAppSidebarOpen)
	unsubscribe('files:sidebar:closed', onAppSidebarClose)
	unsubscribe('files:node:deleted', onNodeDeleted)
	unsubscribe('files:node:updated', onNodeUpdated)
	document.body.classList.remove(SIDEBAR_FULLSCREEN_CLASS)
})

defineExpose<ViewerAPI>({
	open,
	openFolder,
	compare,
	goTo,
	close,
	setEditing,
})
</script>

<style scoped lang="scss">
.viewer__modal {
	:deep(.modal-container__content) {
		display: flex;
		justify-content: center;
		align-items: center;
	}

	:deep(.modal-container) {
		top: var(--header-height) !important;
		bottom: var(--header-height) !important;
		height: auto !important;
		background-color: transparent !important;
		box-shadow: none !important;
	}
}

.viewer__comparison {
	display: flex;
	flex-direction: row;
	justify-content: center;
	align-items: center;
	gap: 8px;
	width: 100%;
	height: 100%;
}

</style>

<!-- Unscoped: when the sidebar is shown next to the viewer, pin it and hide the
     app header so it fills the full height (as the pre-7.0.0 viewer did). -->
<style lang="scss">
body.viewer--sidebar-fullscreen {
	#app-sidebar-vue {
		position: fixed;
		width: calc(var(--app-sidebar-width) + var(--body-container-margin));
	}

	.app-navigation ~ #app-content-vue:has(~ #app-sidebar-vue:not([style*="display: none"])) {
		flex-basis: calc(100% - 300px - clamp(300px, 27vw, 500px));
	}

	#app-content-vue:first-child:has(~ #app-sidebar-vue:not([style*="display: none"])),
	.app-navigation--close ~ #app-content-vue:has(~ #app-sidebar-vue:not([style*="display: none"])),
	.app-navigation--closed ~ #app-content-vue:has(~ #app-sidebar-vue:not([style*="display: none"])) {
		flex-basis: calc(100% - clamp(300px, 27vw, 500px));
	}

	#header {
		visibility: hidden;
	}
}
</style>
