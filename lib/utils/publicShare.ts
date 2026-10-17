/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { IFile, INode } from '@nextcloud/files'

import axios from '@nextcloud/axios'
import { File } from '@nextcloud/files'

/** The public share a node is reached through */
export interface PublicShare {
	/** The share's token */
	token: string
	/** The WebDAV endpoint of public shares, which its files are under */
	remoteURL: string
	/** Where the node is in the share, `/` for the share itself */
	path: string
}

// /public.php/dav/files/<token>, then the path in the share
const PUBLIC_DAV_PATH = /^(.*)\/public\.php\/dav\/files\/([^/]+)(\/.*)?$/
// /s/<token>, /s/<token>/download/<name>, or /s/<token>/download?path=…&files=<name>
const SHARE_LINK_PATH = /^(.*?)(?:\/index\.php)?\/s\/([^/]+)(?:\/download(?:\/(.+))?)?\/?$/

/**
 * The public share a node's address is in, whatever page it is shown on:
 * another app can hand the viewer files it took from a share, as Talk does
 * for a guest. Both forms a share has: its WebDAV address,
 * `/public.php/dav/files/<token>/…`, and its link, `/s/<token>…`, where
 * `?path=` names the folder a file is in.
 *
 * @param node - The file or folder
 */
export function publicShareOf(node: INode): PublicShare | undefined {
	// Encoded, so a # or a ? in a name stays part of the path
	const davURL = parse(node.encodedSource)
	const dav = davURL && PUBLIC_DAV_PATH.exec(davURL.pathname)
	if (davURL && dav) {
		return {
			token: decodeURIComponent(dav[2]!),
			remoteURL: `${davURL.origin}${dav[1]}/public.php/dav`,
			path: decodeURIComponent(dav[3] ?? '/'),
		}
	}

	// As it is, as the folder of a file in a share link is in its query
	const url = parse(node.source)
	const link = url && SHARE_LINK_PATH.exec(url.pathname)
	if (url && link) {
		const folder = (url.searchParams.get('path') ?? '').replace(/\/$/, '')
		const name = link[3] !== undefined ? decodeURIComponent(link[3]) : url.searchParams.get('files')
		return {
			token: decodeURIComponent(link[2]!),
			remoteURL: `${url.origin}${link[1]}/public.php/dav`,
			path: name ? `${folder}/${name}` : (folder || '/'),
		}
	}

	return undefined
}

/**
 * @param address - The address to read
 */
function parse(address: string): URL | undefined {
	try {
		return new URL(address)
	} catch {
		return undefined
	}
}

/**
 * Whether a file is given by its share's link, `/s/<token>…`, rather than by
 * an address it can be fetched at as it is.
 *
 * @param file - The file
 */
export function isShareLink(file: INode): boolean {
	return !PUBLIC_DAV_PATH.test(parse(file.encodedSource)?.pathname ?? '')
		&& SHARE_LINK_PATH.test(parse(file.source)?.pathname ?? '')
}

// Whether each share is a file or a folder, by token, asked once a page
const shareKinds = new Map<string, Promise<'file' | 'folder' | undefined>>()

/**
 * Ask a share whether it is a file or a folder, which its link does not say.
 *
 * @param share - The share
 */
function shareKind(share: PublicShare): Promise<'file' | 'folder' | undefined> {
	let kind = shareKinds.get(share.token)
	if (kind === undefined) {
		kind = axios.request({
			method: 'PROPFIND',
			url: `${share.remoteURL}/files/${encodeURIComponent(share.token)}`,
			headers: { Depth: '0' },
			data: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
			responseType: 'text',
		}).then(({ data }) => {
			const xml = new DOMParser().parseFromString(String(data), 'application/xml')
			return xml.getElementsByTagNameNS('DAV:', 'collection').length > 0 ? 'folder' as const : 'file' as const
		}).catch(() => undefined)
		shareKinds.set(share.token, kind)
	}
	return kind
}

/**
 * A file given by its share's link, `/s/<token>…`, at its WebDAV address
 * instead, which the share is asked for once: the link cannot say whether
 * the share is the file itself, whose address is the share's, or a folder
 * holding it, where the file is found by its path. Through the link, the
 * file of a folder share downloads as a zip of the whole folder.
 *
 * Any other file comes back as it is, and so does one whose share does not
 * answer, for a password say.
 *
 * @param file - The file
 */
export async function resolveShareLink(file: IFile): Promise<IFile> {
	const share = publicShareOf(file)
	if (share === undefined || !isShareLink(file)) {
		return file
	}
	const kind = await shareKind(share)
	if (kind === undefined) {
		return file
	}
	const root = `/files/${share.token}`
	return new File({
		id: file.fileid,
		source: `${share.remoteURL}${root}${kind === 'folder' && share.path !== '/' ? share.path : ''}`,
		root,
		displayname: file.displayname,
		mime: file.mime,
		owner: file.owner,
		permissions: file.permissions,
		size: file.size,
		mtime: file.mtime,
		attributes: { ...file.attributes },
	})
}
