<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Changelog

All notable changes to this project will be documented in this file.

## 2.0.0-beta.17

### Added

- Opened from anywhere but the Files app, the viewer offers its own Download
  and Delete again, as the viewer app did. With a Files context the Files
  actions show instead. Ctrl+S downloads, Ctrl+Delete deletes, Ctrl+E opens
  the editor where it is offered, and F toggles full screen
  (#95, nextcloud/viewer#406)

### Fixed

- A handler asking for the `'default'` theme follows the user's theme again,
  backdrop and header included, as it did in the viewer app. A handler with no
  theme stays dark (#125)
- The viewer's dark palette only applies to its own parts on the dark
  backdrop, no longer to what a handler shows: a document in Text came out
  white on black under a light theme, and printed in grey (#125)
- An end-to-end encrypted image, video or sound is fetched from its own URL:
  the request went to a wrong address and never reached the file (#98)

### Changed

- `vue` and `@nextcloud/vue` are now dependencies rather than peer
  dependencies, so apps still on Vue 2 can use the library (#121)
- Node 24 or newer is required

## 2.0.0-beta.16

### Added

- A video shows at its size as soon as that is known, from its server preview,
  or from the few bytes of an mp4 or mov that hold it, with its poster while it
  buffers. The slideshow holds until it can play (#114, #104)

### Fixed

- Preloading the next or previous video no longer reads all of it: an mp4
  with its index at the end had the browser fetch the whole file. Box headers
  are read to find the index, and a sound's metadata is only read when its
  index comes first. Nothing is preloaded with data saver on
  (#114, nextcloud/viewer#2284)
- The files next to the one shown are preloaded once it has loaded, rather
  than competing with it (#114)
- An update of the file shown that carries the version already on screen no
  longer remounts its element: Text rebuilt its editor on each of its own
  saves (#119)

## 2.0.0-beta.15

### Added

- `onInit()` on a handler, called the first time the viewer needs its element,
  so the view and what it imports stay out of the registration script that
  runs on every page. The viewer waits for the element to be defined before
  rendering it. Tag names may now hold an underscore, for app ids like
  `files_pdfviewer` (#76)
- A "Start slideshow" Files action on a selection of two files or more that
  can all be viewed (#103, nextcloud/viewer#1524)
- Full screen and the sidebar are buttons in the header instead of entries
  in the menu (#99)
- The files next to the one shown are preloaded: the preview a picture will
  ask for, and a video or sound's metadata. `preload` is given the space the
  viewer shows files in as a second argument (#100)
- Zooming into a picture goes to its full resolution: the first zoom fetches
  the largest preview the server renders and swaps it in once decoded, and
  the zoom goes until one of its pixels is four on screen, never less than
  five times as before (#88, nextcloud/viewer#2391)
- `canCompare` on a handler, and `canCompare(node)` for a caller deciding
  whether to offer comparing two versions. The image handler sets it (#94)
- The elected copy of the library says so in the debug log (#83)

### Fixed

- A slideshow skipped videos that were slow to start: stepping to a file now
  waits for it to load, and the slideshow holds while it does
  (#101, nextcloud/viewer#39)
- The image editor's text tool could not be typed in, and the arrow keys
  paged away from an unsaved edit: the modal kept the focus from the editor
  (#112, nextcloud/viewer#3335)
- A file the caller looked up on its own was listed twice: `open()` finds it
  in the list by its source (#102)
- A neighbouring file updated elsewhere kept its old name and source (#100)
- Saving from the image editor could damage a file: it was offered on every
  image and wrote PNG over GIF, SVG, BMP or AVIF. It is back to JPEG, PNG and
  WebP, on a file that may be downloaded, not while comparing, not on a phone
  and not where non-accessible features are turned off (#89)
- Images page through videos and sounds again, as before, and a video shows
  the picture of the same name beside it as its poster (#86)
- Playing a video again no longer downloads it again, and its poster comes
  back once it has played (#87, nextcloud/viewer#2585)
- A video or sound the browser cannot play says so instead of spinning
  forever, and Firefox without an audio device no longer fails every sound
  (#77, nextcloud/viewer#2930, nextcloud/viewer#542)
- Opening the current file after an older version of it showed the old one
  (#85, nextcloud/viewer#3052)
- Pictures in subfolders of a public share got no preview (#90)
- Small videos were stretched to fill the viewer, and the speed label went
  back to an unlocalised value after a change of speed (#91)
- More files are asked for whenever the last one is shown, not only stepping
  forward onto it, and deleting the open file keeps the Files URL in step
  (#92)
- The Files sidebar, when already open as the viewer opens or restored from
  the URL, gets room made for it and follows the file shown.
  `viewer:sidebar:open` carries the whole node again (#93)
- With the Files app on another copy of Vue than the elected viewer, the
  viewer offered no previous, no next and no slideshow (#93)

## 2.0.0-beta.14

### Breaking

- The handler field `tagname` is now `tagName`, the name the files
  sidebar tabs and the other registration APIs use. The shared handler
  registry moved from `_nc_viewer_scope.handlers_v1` to `handlers_v2`,
  so a copy of beta.13 or older on the same page does not share a viewer
  with this one: apps and the server have to move to beta.14 together (#81)

### Added

- A file that takes more than 5 seconds to load says "Still loading…"
  under the spinner, and one that failed to show offers "Try again"
  without closing the viewer (#78)

### Fixed

- Pictures on a share that forbids downloading showed nothing: their
  preview is now fetched with the `x-nc-preview` header the server asks
  for (#51)
- When that preview cannot be loaded either, the viewer says "No preview
  available, download is disabled." instead of "Failed to load image." (#79)
- Rotate and edit only show once the file is shown, not over the loading
  spinner or the error of a file that failed to show (#80)

## 2.0.0-beta.13

### Fixed

- Closing the viewer, then pressing back, opened the file again with the
  Files app on vue-router 5. Its navigations land asynchronously, and the
  viewer tagged the history entry before the router had created it, so it
  found nothing to unwind on close. History changes now wait for the
  router's navigation (#74)

## 2.0.0-beta.12

### Changed

- Every `onClose` passed while the viewer is open is called once when it
  closes, not only the last one. Opening over a viewer that is still open
  used to drop the first opener's, so the Files app never cleaned
  `openfile=true` out of its URL when a handler handed its file to
  another one with `open()`. The same function passed twice is still
  called once, and one that throws does not stop the others (#66)
- The options filled in for a caller that passes none no longer carry
  no-op callbacks. The viewer always called them optionally (#66)

### Fixed

- Clicking rotate again while the previous turn was still being written
  could undo it, and every turn made the picture flash once written.
  Writes now wait for each other and build on the bytes just sent, and
  the viewer no longer reloads a picture it is already showing turned
  (#61)
- The right-click menu is refused on a share that hides or forbids
  the download: the check read the old viewer's names for those
  restrictions, not the ones nodes carry, `hide-download` and
  `share-attributes` (#65)
- Registering the same handler twice, as the server's copy and an app's
  do with the defaults, no longer warns. Another handler taking an id
  that is already used still does (#64)
- The header is readable on the dark backdrop (#60)

### Documentation

- A tutorial that builds a handler from scratch, and a reference that
  lists every option and the whole migration from `OCA.Viewer` (#67)

## 2.0.0-beta.11

### Added

- A rotate button, ahead of the edit button, turns the picture at once
  and writes the turn to the file about a second later by rewriting its
  Exif orientation tag. Nothing is decoded or re-encoded, so the picture
  is the same picture however many times it is turned, and the tag is
  what the preview generator reads, so the new framing follows the file
  into the Files grid and the mobile clients. JPEG only, and only where
  the user may write: no other format carries an orientation this stack
  honours. Written once the user settles rather than once per click,
  since every write makes a version of the file (#49)
- `turns` on `ViewerProps`: the quarter turns the viewer is showing on top
  of the file's own orientation, while a rotation is being written. A
  handler that can turn its content should honour it; the rest may ignore
  it, so this breaks nothing that already exists (#49)
- AVIF opens. Every engine the viewer runs in decodes it natively, so it
  is shown from the file itself; nothing in Nextcloud previews it, so
  listing it as preview-supported would have kept it closed everywhere
  (#50)
- MusicXML scores open, `.musicxml` and the zipped `.mxl`, drawn with
  opensheetmusicdisplay. The renderer is imported inside the component,
  so it is fetched the first time somebody opens a score and never for
  anyone who only opens photos (#52)
- JPEG 2000 opens where the server renders it. Nothing decodes it in the
  browser, so it sits with the other formats that depend on a preview
  provider, and it needs nextcloud/server#64603, which is in 36 (#53)

### Fixed

- A WAV arrives under three different names depending on who wrote it,
  and only one of them was listed, so the other two would not open (#45)

## 2.0.0-beta.10

### Fixed

- Closing the viewer left `openfile=true` in the URL until the history
  unwind landed, and the Files list opens a file for exactly that flag.
  Anything that made it re-read the route in that window opened a second
  viewer over the one that was closing, which on a slow machine is wide
  enough to hit: three media tests in nextcloud/server#63954 failed their
  close assertion with two modals in the DOM. The flag now comes off the
  entry being left before the jump is asked for. (#43)

## 2.0.0-beta.9

### Added

- `open(nodes, file, { startSlideshow: true })` starts the slideshow, ignored
  for a single file and reset on close. Handlers gain a fourth emit,
  `update:playing`, and the slideshow pauses while it is true, so a playing
  clip finishes before it moves on; the video and audio players emit it from
  the media element. (#39)
- `supportsEndToEndEncryption` on `IHandler`, carried by the three default
  handlers. Absent is the safe default. (#38)

### Changed

- `@nextcloud/vue` 9.13.0 is the minimum: `startSlideshow` drives NcModal's
  `v-model:slideshow-running`, which landed there. Below it the option does
  nothing at runtime. (#39)
- `@nextcloud/image-editor` 1.0.0-beta.4. An edited JPEG is written at the
  quality its source was written at rather than the browser's default, and the
  decode and the half-size copies the editor draws from happen in a worker: on
  a 12 Mpx photo and a phone-class CPU, opening one went from 6.1 s to 0.9 s,
  and the longest frame the main thread was held from 5.1 s to 0.4 s. (#41)

### Fixed

- An end-to-end encrypted file is no longer offered to a handler that fetches
  it through its own endpoint and would get ciphertext. Since Nextcloud 33 the
  e2ee app decrypts transparently, but only over WebDAV, so the file is offered
  to handlers that say they read it that way. (#38)
- The API documentation builds again: typedoc reads the rolled-up declarations
  from `dist` rather than running tsc over sources it cannot resolve single
  file components in. It had failed on every push to `main` since beta.8. (#40)

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
