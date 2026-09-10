/**
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IFile } from '@nextcloud/files'

const livePictureExt = ['jpg', 'jpeg', 'png']
const livePictureExtRegex = new RegExp(`\\.(${livePictureExt.join('|')})$`, 'i')

/**
 * Return the peer live photo from a list of files based on its fileId
 *
 * @param peerFileId - The fileId of the peer live photo to look for
 * @param fileList - The list of files to search within
 */
export function findLivePhotoPeerFromFileId(peerFileId: number, fileList: IFile[]): IFile | undefined {
	return fileList.find((file) => file.fileid === peerFileId)
}

/**
 * A file name without its extension.
 *
 * `extension` carries its dot, and a file without one reports an empty
 * string, so neither can be cut by a fixed number of characters.
 *
 * @param file - The file to read the name of
 */
function nameWithoutExtension(file: IFile): string {
	const extension = file.extension ?? ''
	return extension === '' ? file.basename : file.basename.slice(0, -extension.length)
}

/**
 * Return the peer live photo from a list of files based on the original file name.
 *
 * The two halves of a live photo are named alike, so the names have to match
 * exactly: `IMG_1234.mov` belongs with `IMG_1234.jpg` and not with the
 * `IMG_1239.jpg` next to it.
 *
 * @param referenceFile - The file whose peer live photo should be found by name
 * @param fileList - The list of files to search within
 */
export function findLivePhotoPeerFromName(referenceFile: IFile, fileList: IFile[]): IFile | undefined {
	const name = nameWithoutExtension(referenceFile)
	return fileList.find((comparedFile) => {
		// if same filename and extension is allowed
		return comparedFile.source !== referenceFile.source
			&& (nameWithoutExtension(comparedFile) === name && livePictureExtRegex.test(comparedFile.basename))
	})
}
