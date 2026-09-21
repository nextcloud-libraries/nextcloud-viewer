<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\ViewerE2E\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\Util;

/**
 * Puts this checkout of the library on the page of a real server.
 *
 * The script registers the handlers the same way a host app would, so the
 * tests exercise the published entry point rather than a copy of the
 * source wired up especially for them.
 */
class Application extends App implements IBootstrap {
	public const APP_ID = 'viewer_e2e';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	#[\Override]
	public function register(IRegistrationContext $context): void {
	}

	#[\Override]
	public function boot(IBootContext $context): void {
		Util::addScript(self::APP_ID, self::APP_ID . '-main');
	}
}
