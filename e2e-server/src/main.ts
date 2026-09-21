/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// The built package rather than the source: the point of this harness is
// that what gets published works on a real server, and the source needs
// build-time defines that only the library's own config supplies.
import { registerDefaultHandlers } from '../../dist/index.mjs'

// What a host app does, and nothing more: the point of the harness is that
// the library behaves on a real server the way it does on the playground,
// so it must not be helped along here.
registerDefaultHandlers()
