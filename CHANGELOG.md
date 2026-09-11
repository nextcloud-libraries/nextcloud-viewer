<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Changelog

All notable changes to this project will be documented in this file.

## 2.0.0-beta.8

### Changed

- **Breaking**: importing the package no longer registers the image, video
  and audio handlers. The page that provides the viewer calls
  `registerDefaultHandlers()` once, as the server does; an app bundling the
  package gets the page's handlers and registers only its own. (#36)
- **Breaking**: `registerImplementation` and the `ViewerCandidate` type are no
  longer exported. The entry calls it on itself; nothing outside the package
  had a reason to. (#35)
- Previews are requested at the size they are shown, capped at the display and
  rounded up to a multiple of 256, instead of the whole display in device
  pixels for every image. (#31)
- `@nextcloud/image-editor` 1.0.0-beta.3.

### Fixed

- A failed load of the implementation chunk no longer leaves every later
  `open()` rejecting with it; the next open tries again. The rejection of an
  open started from a file action is shown rather than lost to the console,
  and a second copy of the library on the page no longer throws on custom
  elements the first one defined. (#27)
- An `open()` that fails before it has a file (a listing that fails, an
  unknown handler id, `openFolder` on a non-folder) shows its error instead of
  a click that does nothing. (#23)
- `compare()` clears the error of an earlier failed `open()`. (#24)
- "Open with …" keeps the file list: the forced handler filters and navigates
  the slideshow, instead of the first handler that takes each file. (#25)
- Images the server has no preview for, every E2EE image included, show the
  bytes the fallback fetched instead of spinning forever; a second failure
  reports `errored`. (#22)
- A file name holding a `#` loads in the image fallback, the live photo video
  and the editor. (#26)
- Live photos pair on the whole name (`IMG_1234.mov` no longer plays beside
  `IMG_12345.jpg`), play muted so the autoplay policy allows it, and label the
  button with `aria-label`. (#29)
- A pointer that went down beside the image, or that the browser took back
  for a scroll or a swipe, no longer ends a pinch or leaves the image
  mid-drag. (#33)
- Full screen video follows plyr's own `enterfullscreen`/`exitfullscreen`
  rather than counting clicks, so Escape puts the page back; a page without
  the server's header and footer no longer throws. (#28)
- The viewer follows a sidebar resized by hand, hands the page title back
  when torn down with a file open, and an edited file is not frozen on the
  saved bytes: only the save's own update event is skipped. (#30)
- A share whose attributes do not parse is read as forbidding download,
  rather than throwing from the context menu and offering the file. The
  editor saves with `If-Match` and keeps the work open on a 412. An etag
  carrying a literal quote gives one preview URL, not two. (#32)

### Internal

- One shims file, one source of option defaults, and the media components
  reload on the source rather than the display name. (#34)

## 2.0.0-beta.7

### Fixed

- A handler whose `enabled()` throws no longer takes the Files actions menu and
  `open()` down for every file on the page. It is logged and treated as not
  matching, from every place that asks.
- A `preload()` that throws synchronously, or returns no promise, no longer
  makes `open()` reject: the clicked file shows and the preload is logged as
  the failure it is.
- `onEditingChange` fires when the viewer closes while editing. The watch ran
  after `close()` had already dropped the options.
- The error of a failed `open()` is dropped by the next `open()` that succeeds,
  instead of staying up until that handler reports loaded.
- The events a handler emits reach the viewer. `errored` arrives as a
  `CustomEvent` whose detail holds the arguments, so its message was never
  read and every handler error showed the generic text; `update:canSwipe`
  lost its payload the same way and `update:editing` had no listener. A
  handler reporting a string, an Error with no message, an object or nothing
  at all now ends up as a sensible message, and only an explicit `false`
  turns swiping off.
- Swiping is off while zoomed in or while editing, not only when both.

### Internal

- Tests for the service every app calls, the entry, mounting, the handler
  contract and the modal chrome. Statements 77% to 83%, `Viewer.vue` 80% to
  91%.

## 2.0.0-beta.6

### Added

- `canView(node)` and `canView(nodes)`: whether the viewer can open what it is
  handed. Files only, never a node the user cannot read, and for several nodes
  only when one handler takes all of them.
- `open()` takes `enableSidebar: false` for a file the Files sidebar cannot
  resolve, such as an old version served from the versions endpoint.
- The image, video and audio handlers are registered by importing the package.
  `registerDefaultHandlers()` stays exported and is a no-op after the first
  call.

### Changed

- **Breaking**: the enabled preview providers are read from the
  `core.previews.enabled_providers` capability, not from an initial state the
  viewer app provided. Needs a server exposing it; on an older one no
  preview-only mime is offered. `@nextcloud/initial-state` is no longer a peer
  dependency.
- The modal, document title, comparison header, alt text and editor label use
  the node's display name, falling back to the basename.

### Fixed

- The published build no longer contains `?raw` imports only vite can resolve;
  the icons are bundled. A build check fails if any build-time suffix survives
  into `dist`.
- Importing a handler module before the entry no longer hits the entry
  mid-evaluation (`Cannot access '__vite_ssr_import_2__' before
  initialization`). The registry lives in `lib/handlers.ts` now.
- The entry carries only the six strings the file actions are named after, in
  every locale; the rest of the catalog loads with the viewer. 214 kB to 28 kB.

## 2.0.0-beta.5

### Fixed

- Video and audio controls are translated again. The viewer this replaced handed
  plyr its own translations and relabelled the speed menu once the controls
  existed; the composable that replaced those components did neither, so every
  control read in English in beta.1 through beta.4 whatever language the user
  ran in.

### Internal

- `npm run check:size` fails the build if importing the package stops being
  cheap. The entry is meant to cost the handler registration and nothing else,
  and a single top-level import of a component quietly puts the whole viewer
  back on every page of every consumer.
- Dropped `camelcase` and the `@nextcloud/auth` peer dependency, left behind by
  the `fileinfo` utilities that went in beta.4.

## 2.0.0-beta.4

### Fixed

- Remove a debugging hook that was left on `window.__vd` in beta.2 and beta.3.
  It exposed the viewer's internal loading state and was never meant to ship.

### Removed

- `genFileInfo`, `extractFilePaths`, `extractFilePathFromSource` and the
  `FileInfo` type. They converted WebDAV responses into the object shape the
  old `OCA.Viewer.open({ fileinfo })` API took; nothing has called them since
  the viewer moved to `@nextcloud/files` nodes throughout.

## 2.0.0-beta.3

### Fixed

- Accept `@nextcloud/sharing` 1.x as a peer alongside 0.4. The server has moved
  to 1.x, and pinning 0.4 made the package uninstallable there. The two
  functions the viewer uses, `isPublicShare` and `getSharingToken`, are the same
  in both.

## 2.0.0-beta.2

Fixes found by reading the viewer this one replaced side by side with it.

### Fixed

- The spinner no longer stays up forever when a file is reopened. The Files app
  opens the same file more than once, and every open was treated as a fresh
  load the handler would never report finishing.
- The viewer is dark whatever theme the user runs, rather than following it.
  A handler can still ask for a light backdrop.
- Editing is only offered for a file the user may write, and the viewer is only
  offered for a file they may read. Deleted files stay viewable.
- The context menu is refused over a file a share forbids downloading.
- A folder the viewer fetches itself is sorted the way the user sorted their
  files list, rather than by name.
- The page title names the file being viewed again, full screen is back in the
  menu, and loading a file is dropped when the viewer moves to another one.

## 2.0.0-beta.1

First release from this repository. The viewer itself now lives here, not only
its API bindings, and the server consumes it like any other package.

### Breaking

- The `OCA.Viewer` global is gone. Import from `@nextcloud/viewer` instead, and
  see the migration table in the README.
- Handlers are custom elements named by `tagname`, not Vue components handed to
  the viewer.
- Files and lists are `@nextcloud/files` nodes. There is no path-based entry
  point, and `fileinfo` objects are not accepted.
- The handler registry moved from `window._oca_viewer_handlers` to a scope keyed
  by handler ABI, `window._nc_viewer_scope.handlers_v1`.

### Added

- Several copies of the library can share a page. Each offers itself as a
  candidate; the newest is loaded once, on first use.
- The viewer is loaded on demand, so registering a handler no longer pulls the
  viewer's own weight onto the page.
