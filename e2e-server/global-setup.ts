/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { configureNextcloud, runOcc, startNextcloud, waitOnNextcloud } from '@nextcloud/e2e-test-server/docker'
import { fileURLToPath } from 'node:url'

/**
 * Bring up a Nextcloud with this checkout of the library loaded into it.
 *
 * The playground answers for itself, which is what makes it quick, and it
 * is also why the formats that depend on the server rendering a preview
 * cannot be covered there: there is no preview endpoint to ask. This
 * starts a real server, mounts the harness app that loads the library,
 * and hands the tests its address.
 */
export default async function globalSetup(): Promise<void> {
	const app = fileURLToPath(new URL('.', import.meta.url))
	const branch = process.env.NEXTCLOUD_BRANCH ?? 'master'

	const ip = await startNextcloud(branch, app)
	// The container answers before the install has finished, and occ says
	// so rather than waiting
	await waitOnNextcloud(ip)
	await configureNextcloud(['viewer_e2e'], branch)

	// The formats worth covering here are the ones a provider has to render,
	// and every ImageMagick provider is off until an admin asks for it. An
	// installation would not have these on; the point is to prove the
	// library shows what the server produces once they are.
	//
	// One occ call per entry, because the setting is a list and occ takes a
	// list an index at a time.
	const providers = [
		'OC\\Preview\\PNG',
		'OC\\Preview\\JPEG',
		'OC\\Preview\\GIF',
		'OC\\Preview\\HEIC',
		'OC\\Preview\\TIFF',
		'OC\\Preview\\JP2',
	]
	for (const [index, provider] of providers.entries()) {
		await runOcc(['config:system:set', 'enabledPreviewProviders', String(index), '--value', provider])
	}

	// Read in the workers rather than here: this runs after the config has
	// been evaluated in the main process, and the workers are started after
	// it, so they inherit the address and evaluate `use.baseURL` with it
	process.env.PLAYWRIGHT_TEST_BASE_URL = `http://${ip}`
}
