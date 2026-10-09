/*!
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * A name aimed at breaking the viewer where it escapes one wrong.
 *
 * @param realName - The fixture it stands for
 */
export function oddFileName(realName: string): string {
	const ext = realName.split('.').pop() ?? ''
	return '~⛰️ shot of a $[big} mountain`, '
		+ "realy #1's "
		+ '" #_+="%2520%27%22%60%25%21%23 was this called '
		+ realName
		+ 'in the'
		+ '☁️'
		+ '👩‍💻'
		+ '? :* .'
		+ ext.toUpperCase()
}

/**
 * A folder name just as odd, around the fixture's name.
 *
 * @param realName - The fixture it stands for
 */
export function oddFolderName(realName: string): string {
	return 'Nextcloud "%27%22%60%25%21%23" >`⛰️<' + realName + "><` e*'rocks!#?#%~"
}

/** The fixtures put under an odd name with `?oddnames` */
export const ODD_FIXTURES = [
	{ name: 'picture.png', mime: 'image/png', tagName: 'oca-viewer-image' },
	{ name: 'video.mp4', mime: 'video/mp4', tagName: 'oca-viewer-video' },
	{ name: 'audio.mp3', mime: 'audio/mpeg', tagName: 'oca-viewer-audio' },
]
