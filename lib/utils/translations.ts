/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/**
 * Every string of the library, in every locale.
 *
 * This is the largest single thing the package ships, so it lives on its
 * own and is only ever reached through a dynamic import, from the viewer
 * as it mounts. Importing it from anywhere the entry reaches statically
 * puts it back on every page.
 */
export const translations = __TRANSLATIONS__
