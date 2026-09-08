<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Changelog

All notable changes to this project will be documented in this file.

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
