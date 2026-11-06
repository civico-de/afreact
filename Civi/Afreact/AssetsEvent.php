<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Core\Event\GenericHookEvent;

/**
 * The `civi.afreact.assets` event: `builder` is `search_kit` or `afform` on a builder page and ''
 * elsewhere; listeners add custom element names to `panels` and replaced modules to `replaces`.
 *
 * @property-read string $builder
 * @property list<string> $panels
 * @property list<string> $replaces
 */
final class AssetsEvent extends GenericHookEvent {

  const NAME = 'civi.afreact.assets';

}
