<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Core\Event\GenericHookEvent;
use Civi\Core\Service\AutoSubscriber;
use Civi\Esm\ImportMap;
use CRM_Afreact_ExtensionUtil as E;

/**
 * The import map entries through which other extensions' modules share afreact's React, TanStack
 * Query and components (docs/kit.md).
 */
final class Kit extends AutoSubscriber {

  public const PREFIX = 'afreact/';

  public static function getSubscribedEvents(): array {
    return [
      'hook_civicrm_esmImportMap' => 'onEsmImportMap',
    ];
  }

  /**
   * Maps `afreact/<module>.js` to each module under dist/kit/ with core's cache code, as
   * addModuleFile() loads afreact's own entries, so a flush after an upgrade renews both.
   */
  public static function onEsmImportMap(GenericHookEvent $e): void {
    $importMap = $e->importMap;
    if (!$importMap instanceof ImportMap) {
      throw new \CRM_Core_Exception('hook_civicrm_esmImportMap came without an import map.');
    }
    foreach (self::modules() as $module) {
      $importMap->addPrefix(
        self::PREFIX . $module,
        E::LONG_NAME,
        \Civi::resources()->addCacheCode("dist/kit/{$module}"),
      );
    }
  }

  /**
   * The file names of the modules under dist/kit/.
   *
   * @return list<string>
   */
  public static function modules(): array {
    $files = glob(E::path('dist/kit/*.js'));
    if (!$files) {
      throw new \CRM_Core_Exception('afreact has no modules under dist/kit/; build it with `bun run build`.');
    }
    return array_map(basename(...), $files);
  }

  /**
   * The styles and translations the kit's components need, for a page that adds a module importing
   * them; adding that module with addModuleFile() makes core emit the import map.
   */
  public static function load(): void {
    \Civi::resources()->addStyleFile(E::LONG_NAME, 'dist/afreact.css');
    Strings::add(Strings::DOMAINS['search_kit']);
  }

}
