/**
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/* eslint-disable jsdoc/require-jsdoc */

import type { IFile } from '@nextcloud/files'
import type { ResponseDataDetailed, WebDAVClient } from 'webdav'

import axios from '@nextcloud/axios'
import { getClient } from '@nextcloud/files/dav'

// Manually load a WebDAV media from its filename, then expose the received Blob as an object URL.
// This is needed for E2EE files that will error when loading them directly from the HTML element's src attribute.
// Can be removed if we ever move the E2EE proxy to a service worker.
export async function preloadMedia(file: IFile, signal?: AbortSignal): Promise<string> {
	const client = getClient() as WebDAVClient
	const response = await client.getFileContents(file.source, { details: true, signal }) as ResponseDataDetailed<ArrayBuffer>
	return URL.createObjectURL(new Blob([response.data], { type: response.headers['content-type'] }))
}

/**
 * Fetch a preview the element cannot ask for itself.
 *
 * A share with download turned off has the preview endpoint refuse a plain
 * request, and the server offers one way through: the `x-nc-preview` header
 * (`core/Controller/PreviewController.php`, and the public-share controller
 * beside it). An `img` element cannot set a header on its own request, so
 * the bytes are fetched here and handed over as an object URL instead.
 *
 * The server calls this obfuscation rather than a boundary, and so should
 * we: it is what keeps the preview URL from being useful when pasted
 * elsewhere, not what decides who may see the file.
 *
 * @param url the preview URL to fetch
 * @param signal aborts the request when the viewer moves to another file
 */
export async function preloadPreview(url: string, signal?: AbortSignal): Promise<string> {
	const response = await axios.get(url, {
		headers: { 'x-nc-preview': 'true' },
		responseType: 'blob',
		signal,
	})
	return URL.createObjectURL(response.data as Blob)
}
