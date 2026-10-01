<!--
  - SPDX-FileCopyrightText: 2019 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# @nextcloud/viewer

[![REUSE status](https://api.reuse.software/badge/github.com/nextcloud-libraries/nextcloud-viewer)](https://api.reuse.software/info/github.com/nextcloud-libraries/nextcloud-viewer)
[![npm](https://img.shields.io/npm/v/@nextcloud/viewer.svg)](https://www.npmjs.com/package/@nextcloud/viewer)

The file viewer used by Nextcloud: a modal for images, video and audio, and the
API apps use to render their own file types in it. Register a handler as a custom
element and your files open in the same viewer as everything else, with
navigation, editing and sharing already wired up.

![The viewer showing an image](https://raw.githubusercontent.com/nextcloud-libraries/nextcloud-viewer/main/.github/screenshot.jpg)

[API documentation](https://nextcloud-libraries.github.io/nextcloud-viewer/)

```sh
npm install @nextcloud/viewer
```

## Usage

This package covers two independent needs. Most apps only have one:

- **Rendering your own file type in the viewer:** [register a handler](#-add-your-own-file-view)
  so files of your mimetype open in the viewer instead of downloading.
- **Opening the viewer from your own code:** [call `getViewer()`](#-open-the-viewer-programmatically),
  e.g. to open an image from a dashboard widget or a search result.

Registering a handler does not require you to also open the viewer yourself, and
opening the viewer does not require registering a handler.

New to it? The [tutorial](#-tutorial-your-first-handler) builds a small handler
from scratch, the sections after it are the reference.

### 🎓 Tutorial: your first handler

Let's show a file type the viewer doesn't know yet. Say your app `myapp` stores
notes as plain text under their own mime, `application/x-myapp-note`, and clicking
one in Files currently just downloads it. By the end of this, it opens in the
viewer, with next and previous, the sidebar and the header actions for free 👋

#### 1. Install the package

```sh
npm install @nextcloud/viewer @nextcloud/files
```

#### 2. Write the view

A normal Vue component. It gets the file as a prop, and tells the viewer when it
is ready, or when it is not:

```vue
<!-- src/views/NoteView.vue -->
<template>
	<pre>{{ text }}</pre>
</template>

<script setup lang="ts">
import type { ViewerEmits, ViewerProps } from '@nextcloud/viewer'

import axios from '@nextcloud/axios'
import { onMounted, ref } from 'vue'

const props = defineProps<ViewerProps>()
const emit = defineEmits<ViewerEmits>()

const text = ref('')

onMounted(async () => {
	try {
		const { data } = await axios.get<string>(props.file.encodedSource, { responseType: 'text' })
		text.value = data
		emit('loaded')
	} catch (error) {
		emit('errored', error as Error)
	}
})
</script>
```

Until `loaded` arrives the viewer shows its spinner, so don't forget it. The
element is mounted again for every file, which is why `onMounted` is enough here.

#### 3. Register it

This script turns the component into a custom element and tells the viewer which
files it takes:

```ts
// src/init-viewer.ts
import { t } from '@nextcloud/l10n'
import { registerHandler } from '@nextcloud/viewer'
import { defineCustomElement } from 'vue'
import NoteView from './views/NoteView.vue'

const tagName = 'myapp-note-view'

if (!window.customElements.get(tagName)) {
	window.customElements.define(tagName, defineCustomElement(NoteView, { shadowRoot: false }))
}

registerHandler({
	id: 'myapp-notes',
	displayName: t('myapp', 'Notes'),
	tagName,
	enabled: (nodes) => nodes.every((node) => node.mime === 'application/x-myapp-note'),
})
```

Add it as an entry of your build, next to your other ones:

```js
// vite.config.js
import { createAppConfig } from '@nextcloud/vite-config'

export default createAppConfig({
	'init-viewer': 'src/init-viewer.ts',
})
```

It lands in `js/myapp-init-viewer.mjs`. This script runs on every page, so keep
it small: if your view pulls in something heavy, have the element render a small
wrapper that loads the real view with `defineAsyncComponent`.

#### 4. Load it on every page

Files can be opened from any page, not only the Files app, so the registration
goes out with every page the server renders:

```php
// lib/Listener/ViewerListener.php
namespace OCA\MyApp\Listener;

use OCA\MyApp\AppInfo\Application;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/** @template-implements IEventListener<BeforeTemplateRenderedEvent> */
class ViewerListener implements IEventListener {
	public function handle(Event $event): void {
		if (!$event instanceof BeforeTemplateRenderedEvent) {
			return;
		}
		Util::addInitScript(Application::APP_ID, 'myapp-init-viewer');
	}
}
```

```php
// lib/AppInfo/Application.php, in register()
$context->registerEventListener(BeforeTemplateRenderedEvent::class, ViewerListener::class);
```

An init script, not a regular one: the viewer reads its handlers when the first
file is opened, and a handler registered after that never shows up.

#### 5. Try it 🎉

Build, reload Files and click one of your notes. It should open in the viewer.
If it downloads instead, check that `js/myapp-init-viewer.mjs` is on the page and
that your file really has the mime your `enabled()` expects.

#### ✨ Opening it yourself

Your app can open the viewer too, say from a list of recent notes. It takes
`@nextcloud/files` nodes, and the most reliable way to get one is to ask WebDAV,
so it carries everything the viewer looks at, permissions included:

```ts
import { getClient, getDefaultPropfind, getRootPath, resultToNode } from '@nextcloud/files/dav'
import { getViewer } from '@nextcloud/viewer'

async function openNote(path: string) {
	const { data } = await getClient().stat(`${getRootPath()}${path}`, { details: true, data: getDefaultPropfind() })
	const node = resultToNode(data)
	await getViewer().open([node], node)
}
```

That's it! The sections below go through every option in detail.

### 🔍 Add your own file view

To show your own file type in the viewer, register a handler with the
[`@nextcloud/viewer`](https://www.npmjs.com/package/@nextcloud/viewer) package.

Handlers are rendered as **native custom elements**, not as Vue components passed
directly to the viewer. You register a custom element with the browser, then
reference it from your handler by its `tagName`.

#### 1. Create your view component

Write a Vue component that consumes the `ViewerProps` props and can emit the
`ViewerEmits` events. The viewer passes the props automatically and reacts to the
emitted events.

```vue
<!-- MyView.vue -->
<template>
	<div>
		<img
			:src="src"
			:style="{ maxHeight: maxHeight + 'px', maxWidth: maxWidth + 'px' }"
			@load="emit('loaded')"
			@error="emit('errored', new Error('Could not load file'))">
	</div>
</template>

<script setup lang="ts">
import type { ViewerEmits, ViewerProps } from '@nextcloud/viewer'
import { computed } from 'vue'

const props = defineProps<ViewerProps>()
const emit = defineEmits<ViewerEmits>()

const src = computed(() => props.file.encodedSource)
</script>
```

`ViewerProps` provides:

| Prop             | Type      | Description                                     |
| ---------------- | --------- | ----------------------------------------------- |
| `file`           | `File`    | The file currently displayed                    |
| `files`          | `File[]`  | The list of files currently opened in the viewer |
| `maxHeight`      | `number`  | Max height of the viewer container              |
| `maxWidth`       | `number`  | Max width of the viewer container               |
| `editing`        | `boolean` | Whether the viewer is in editing mode           |
| `isSidebarShown` | `boolean` | Whether the sidebar is shown                    |
| `localSource`    | `string`  | An object URL to show instead of the file, e.g. right after an edit. Optional |
| `turns`          | `number`  | Quarter turns the viewer asks you to show the file rotated by. Optional |

`ViewerEmits` lets you emit:

| Event              | Payload   | Description                                                    |
| ------------------ | --------- | ------------------------------------------------------------- |
| `loaded`           | –         | Notify the viewer your component is done loading              |
| `errored`          | `[Error]` | Notify the viewer an error occurred (custom message shown)    |
| `update:canSwipe`  | `[boolean]` | Enable/disable the swipe gesture (e.g. for custom controls) |
| `update:editing`   | `[boolean]` | Notify the viewer the editing mode changed                  |
| `update:playing`   | `[boolean]` | Notify the viewer media plays, so the slideshow waits for it |

#### 2. Define the custom element and register the handler

Turn your component into a custom element with Vue's `defineCustomElement`, define
it on `window.customElements`, then register a handler that points at it via
`tagName`:

```ts
import MyIconSvg from '@mdi/svg/svg/file-image.svg?raw'
import { t } from '@nextcloud/l10n'
import { registerHandler } from '@nextcloud/viewer'
import { defineCustomElement } from 'vue'
import MyView from './MyView.vue'

// A valid custom element tag name: lowercase, must contain a hyphen,
// no consecutive hyphens, no leading/trailing hyphen.
const tagName = 'my-app-viewer'

// Define the custom element. `shadowRoot: false` keeps the element in the
// light DOM so Nextcloud's global styles and CSS variables apply. A tag can
// only be defined once per page, hence the check.
if (!window.customElements.get(tagName)) {
	window.customElements.define(tagName, defineCustomElement(MyView, { shadowRoot: false }))
}

// Register the handler.
registerHandler({
	// Unique identifier for the handler.
	id: 'my-app',

	// Translated, human-readable name shown in the "Open with …" menu.
	displayName: t('myapp', 'My viewer'),

	// The custom element tag name registered above.
	tagName,

	// Optional inline SVG icon for the "Open with …" menu entry.
	iconSvgInline: MyIconSvg,

	// Optional group. When opening a folder, files are collected across all
	// enabled handlers sharing this group, so e.g. an image handler and a
	// video handler in the 'media' group build one combined slideshow.
	group: 'media',

	// Return true when this handler can display the given files.
	enabled: (nodes) => nodes.every((node) => node.mime === 'image/png'),

	// Optional: preload data for the previous/next files so navigation is
	// snappier. Called for neighbouring nodes when a file is opened.
	preload: async (node) => {
		await fetch(node.encodedSource)
	},

	// Optional viewer modal theme: 'dark', 'light' or 'default'.
	theme: 'default',

	// Optional: whether the handler works with end-to-end encrypted files.
	// They are decrypted when fetched from their WebDAV endpoint, a handler
	// fetching from a different endpoint gets ciphertext. True when the
	// component reads the file from `node.encodedSource`.
	supportsEndToEndEncryption: true,
})
```

The full handler shape (see the `IHandler` interface):

| Field           | Type                                  | Required | Description                                                        |
| --------------- | ------------------------------------- | -------- | ------------------------------------------------------------------ |
| `id`            | `string`                              | yes      | Unique, non-empty handler identifier                               |
| `displayName`   | `string`                              | yes      | Translated name shown in the "Open with …" menu                    |
| `tagName`       | `string`                              | yes      | Registered custom element tag name (must contain a hyphen)         |
| `enabled`       | `(nodes: File[]) => boolean`          | yes      | Whether the handler can open the given files                       |
| `iconSvgInline` | `string`                              | no       | Inline SVG icon for the menu entry                                 |
| `group`         | `string`                              | no       | Group used to combine handlers when opening a folder               |
| `preload`       | `(node: File) => Promise<void>`       | no       | Preload data for neighbouring files                                |
| `theme`         | `'dark' \| 'light' \| 'default'`      | no       | Viewer modal theme                                                 |
| `supportsEndToEndEncryption` | `boolean`                | no       | Whether the handler supports end-to-end encrypted files            |

Gotchas:

- `tagName` must be lowercase, contain a hyphen, and have no leading, trailing
  or consecutive hyphens (e.g. `my-app-viewer`). An invalid one throws.
- `id` must be unique **across every app on the page**, not just your own:
  it is not namespaced for you. A collision does not throw: the second
  registration is silently dropped with a console warning, so pick something
  specific to your app (`myapp-image`, not `image`).
- Registering the same handler again, with the same `id` and `tagName`, is
  quietly ignored. That is what happens when several copies of the package
  on a page register the defaults, so there is nothing to guard against.
- Registering after the viewer has already read the handler list is not an
  error either. The handler just never appears in the "Open with …" menu.
  See [step 3](#3-load-your-registration-before-the-viewer) below for why
  that means an init script.

#### 3. Load your registration before the viewer

The handler must be registered **before** the viewer initializes. Load your
registration script from the server side with `\OCP\Util::addInitScript` so it runs
early enough:

```php
\OCP\Util::addInitScript('myapp', 'myapp-viewer-register');
```

That is all the server side there is. There is no event to dispatch and no viewer
script to add: the copy of the library your app bundles offers itself as the
page's viewer, and whichever copy wins is loaded the first time a file is opened.
See [how a page ends up with one viewer](#-how-a-page-ends-up-with-one-viewer)
for what happens in between.

### 🚀 Open the viewer programmatically

If you are not registering a handler, no server-side setup is needed. A plain
`import { getViewer } from '@nextcloud/viewer'` in your regular bundle is enough,
no `\OCP\Util::addInitScript` required: from Nextcloud 36 on, the server ships a
copy of its own and registers the handlers for images, video and audio on every
page.

Importing the package registers nothing by itself. A page the server does not set
up, such as a standalone playground, needs to ask for those handlers, and so does
an app that also runs on Nextcloud 35 or older. Calling it where the server
already has is harmless:

```ts
import { registerDefaultHandlers } from '@nextcloud/viewer'

registerDefaultHandlers()
```

Only call `open()` in response to an actual user interaction, not eagerly at
import or mount time. [How a page ends up with one
viewer](#-how-a-page-ends-up-with-one-viewer) explains why that matters.

Use the public `getViewer()` API to open the viewer from your own code. It returns
a shared `Viewer` instance:

```ts
import { getViewer } from '@nextcloud/viewer'

const viewer = getViewer()

// Open a list of files, optionally starting on a specific file and forcing a
// specific handler by its id. Next and previous follow the order of this list.
await viewer.open(files, files[0], options, 'my-app')

// Open every viewable file of a folder, ordered by name like the files list.
await viewer.openFolder(folder, file, options, 'my-app')

// Open two files side by side for comparison.
await viewer.compare(file1, file2, 'my-app')
```

Signatures:

- `open(nodes: File[], file?: File, options?: ViewerOptions, handlerId?: string): Promise<void>`
- `openFolder(folder: Folder, file?: File, options?: ViewerOptions, handlerId?: string): Promise<void>`
- `compare(node1: File, node2: File, handlerId?: string): Promise<void>`
- `close(): void`

#### Ordering

The viewer never reorders a list you give it. `open()` steps through `nodes` in
the order you pass them, so a list taken from the files list is stepped through
in whatever order the user has it sorted, including a sort the viewer knows
nothing about. Pass the list you are showing, not a list you have re-sorted.

`openFolder()` is the exception, because it fetches the folder itself and a
WebDAV reply has no order worth relying on. It asks the files list how the user
has it sorted and sorts the folder the same way, so paging through it matches
what the user would see in the list. A public share has no such setting, and
neither does a request that fails: both fall back to names ascending.

`ViewerOptions` lets you hook into navigation and paging. All of them are optional:

| Option            | Type                          | Description                                                          |
| ----------------- | ----------------------------- | -------------------------------------------------------------------- |
| `loadMore`        | `() => Promise<File[]>`       | Called to append more files when reaching the end of the list        |
| `onPrev`          | `(file: File) => void`        | Called with the file navigated to, going back                         |
| `onNext`          | `(file: File) => void`        | Called with the file navigated to, going forward                      |
| `onClose`         | `() => void`                  | Called when the viewer is closed                                     |
| `canLoop`         | `boolean`                     | Whether navigation loops from last to first and back. Defaults to `true` |
| `startSlideshow`  | `boolean`                     | Whether to start the slideshow on open, given more than one file     |
| `editing`         | `boolean`                     | Open straight into editing mode, for a handler that can edit         |
| `onEditingChange` | `(editing: boolean) => void`  | Called when editing mode changes, e.g. to keep it in the URL         |
| `enableSidebar`   | `boolean`                     | Whether to offer the Files sidebar. Defaults to `true`, turn it off for files it cannot resolve, like an old version |
| `view`            | `View`                        | The Files view the viewer was opened from, handed to the file actions in its header |
| `folder`          | `Folder`                      | The folder the files live in, handed to those actions as well        |

### 🧭 Migrating from `OCA.Viewer`

The `OCA.Viewer` global is gone. Everything is imported from the
[`@nextcloud/viewer`](https://www.npmjs.com/package/@nextcloud/viewer) package
instead, and the viewer works with `@nextcloud/files` nodes rather than the
`fileinfo` objects and path strings it used to take.

| Before                                            | Now                                                            |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `OCA.Viewer.open({ path })`                       | `getViewer().openFolder(folder, file)`                         |
| `OCA.Viewer.open({ path, list })`                 | `getViewer().open(nodes, file)`                                |
| `OCA.Viewer.open({ fileInfo, list })`             | `getViewer().open(nodes, file)`                                |
| `OCA.Viewer.openWith(id, { … })`                  | `getViewer().open(nodes, file, options, id)`                   |
| `OCA.Viewer.open({ …, startSlideshow: true })`    | `getViewer().open(nodes, file, { startSlideshow: true })`      |
| `OCA.Viewer.compare(fileInfo1, fileInfo2)`        | `getViewer().compare(node1, node2)`                            |
| `OCA.Viewer.close()`                              | `getViewer().close()`                                          |
| `OCA.Viewer.mimetypes.includes(node.mime)`        | `canView(node)`                                                |
| `OCA.Viewer.mimetypesCompare.includes(node.mime)` | `canView(node)`                                                |
| `OCA.Viewer.availableHandlers`                    | `getHandlers()`, or `canView(node)` to test one file           |
| `OCA.Viewer.registerHandler({ component })`       | `registerHandler({ tagName })`, see above                      |
| `canCompare: true` on a handler                   | nothing, any handler can be compared                           |
| `\OCP\Util::addScript` for the registration        | `\OCP\Util::addInitScript`                                      |
| A listener for `OCA\Viewer\Event\LoadViewer`       | a listener for `BeforeTemplateRenderedEvent`, see the [tutorial](#4-load-it-on-every-page) |
| Dispatching `OCA\Viewer\Event\LoadViewer`          | nothing, the viewer is on every page already                   |

Inside a handler, what used to be read off the global comes in as props:

| Before                     | Now                                                     |
| -------------------------- | ------------------------------------------------------- |
| `OCA.Viewer.file`          | the `file` prop                                         |
| `OCA.Viewer.list`          | the `files` prop                                        |
| `OCA.Viewer.enableSidebar` | no equivalent, it is the opener's option; `isSidebarShown` says whether it is open right now |
| `OCA.Viewer.loadMore`      | no equivalent, the viewer calls it and handles the list |
| `OCA.Viewer.onPrev`, `onNext`, `onClose`, `canLoop` | no equivalent, they belong to whoever opened the viewer |

Two changes are worth calling out because they are not a rename:

Handlers are custom elements now, not Vue components handed to the viewer. A
handler names a `tagName` you have defined on `window.customElements`, which is
what lets the viewer render a handler written in any framework, or none. The
[registration section](#-add-your-own-file-view) walks through it.

Lists and files are `@nextcloud/files` nodes. There is no path-based entry point
any more: build the nodes you already have, or hand `openFolder()` a folder and
let it fetch. `fileinfo` objects are not accepted. A node you build by hand should
carry what a WebDAV response would, `permissions` above all: the viewer hides the
download, rotate and edit actions for a node without them. When in doubt, ask
WebDAV for it, as the [tutorial](#-opening-it-yourself) does.

> [!TIP]
> If you feel like your mime should be integrated in this repo, you can also create
> a pull request with your handler in the `models` directory and its view in the
> `components` directory. Please have a look at what's already here and take example
> of it (e.g. `models/videos.ts` + `components/Videos.vue`). 🙇‍♀️

### 🧩 How a page ends up with one viewer

Several apps on a page can each bundle this library, at different versions. They
must still end up sharing **one** viewer: it is a modal on `document.body` that
owns the history entries, the focus trap and the keyboard handling, and two of
them fighting over those is a bug you can see.

So importing the package does not load a viewer. It registers a *candidate*:

```ts
registerImplementation({ version: __VIEWER_VERSION__, load: () => import('./mount.ts') })
```

Registering costs nothing, and the losing copies never fetch their
implementation chunk at all. The first time something opens a file, the newest
registered candidate is loaded and mounted, once, and every other copy on the
page delegates to it.

Newest, rather than the first to register: script order across apps is not
something anyone controls, so electing the first to arrive would mean the viewer
behaves differently depending on which app's bundle happened to load first.

The handler registry and the elected viewer live under a window key named for
the **handler ABI**, not for this package's version:

```js
window._nc_viewer_scope.handlers_v2
```

Keying it by package version would split the registry on every major release,
and since there is only one viewer, a split registry means handlers that quietly
never open. The key moves only when the shape of `IHandler` itself breaks, at
which point the two generations genuinely cannot share a viewer.

Copies within a major are compatible, so the newest simply wins and nothing is
said about it. Copies from **different majors** are worth a word: the library
warns in the console, naming what it found and which one will run. Only one of
them can, and the apps that pinned the other expect behaviour it may not have.

The election happens once, on the first call to `open()`, `openFolder()` or
`compare()`. Whichever candidate is newest **at that moment** wins, and every
handler registration script on the page runs synchronously during page load, so
by the time a user can click anything, every candidate is already in. Calling
`open()` yourself before that point, e.g. eagerly at import or mount, can elect
a viewer before every app has had the chance to register its handlers.

The entry is kept small on purpose, and `npm run check:size` fails the build if
that stops being true: it walks what the entry reaches without a dynamic import
and checks it against a budget. A single top-level import of a component is
enough to put the whole viewer back on every page of every consumer, and
nothing else would complain.

Two consequences worth knowing:

- Registering a handler is cheap. It costs the handler definition, not the
  viewer, so apps can register on every page without paying for it.
- The server ships a copy too. That copy is the floor: always present, always
  patchable by a server update, and beaten by any app that ships a newer one.
