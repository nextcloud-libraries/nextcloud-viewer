<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Changelog

All notable changes to this project will be documented in this file.

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
