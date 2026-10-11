<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use CRM_Afreact_ExtensionUtil as E;

/**
 * The React builder pages: afreact's own routes, and core's routes of a builder taken over.
 */
final class AdminPage {

  public const CALLBACK = 'Civi\Afreact\AdminPage::render';

  /**
   * afreact's own route of each builder => the core route whose screens it shows.
   */
  public const OWN = [
    'civicrm/admin/afreact/search' => 'civicrm/admin/search',
    'civicrm/admin/afreact/afform' => 'civicrm/admin/afform',
    'civicrm/afreact/search' => 'civicrm/search',
  ];

  public static function render(): string {
    // The menu item, not the request path, which may run on below it.
    $route = self::route(Record::string(\CRM_Core_Menu::get(\CRM_Utils_System::currentPath() ?? ''), 'path') ?? '');
    $builder = Builders::builderOf($route);
    if ($builder === NULL) {
      throw new \CRM_Core_Exception('No React builder for this route.');
    }
    self::load($builder);
    return Chrome::page(sprintf(
      '<div id="bootstrap-theme" class="afreact-builder-page"><afreact-builder builder="%s" route="%s" classic="%s" core-version="%s"></afreact-builder></div>',
      Chrome::escape($builder),
      Chrome::escape($route),
      Chrome::escape((string) \Civi::url('backend://' . self::classic($route))),
      Chrome::escape(\CRM_Utils_System::version()),
    ));
  }

  /**
   * Where core's page for `$route` runs: its classic route when taken over, else the route itself.
   */
  public static function classic(string $route): string {
    return Builders::moved()[$route] ?? $route;
  }

  /**
   * The core route a request path shows: an own route's core route, or the path itself.
   */
  public static function route(string $path): string {
    return self::OWN[$path] ?? $path;
  }

  /**
   * The bundles, and what plugins add for `$builder` ('' outside a builder page).
   */
  public static function load(string $builder): void {
    Assets::load($builder);
    $islands = $builder === 'search_kit' ? Islands::modules() : [];
    if ($islands !== []) {
      Chrome::angular()->addModules($islands);
    }
    \Civi::resources()->addVars('afreactAdmin', ['islandModules' => $islands]);
    \Civi::resources()->addModuleFile(E::LONG_NAME, 'dist/afreact-admin.js');
    self::settings($builder);
    Strings::add(Strings::DOMAINS[$builder] ?? NULL);
  }

  /**
   * What core's builder modules get from their settingsFactory, and the permissions they declare.
   */
  private static function settings(string $builder): void {
    $modules = match ($builder) {
      'search_kit' => [
        'crmSearchAdmin' => 'searchAdmin',
        'crmSearchTasks' => 'searchTasks',
        'crmSearchDisplay' => 'searchDisplay',
      ],
      'afform' => ['afAdmin' => 'afAdmin', 'afGuiEditor' => 'afGuiEditor'],
      default => [],
    };
    $angular = Afforms::angular();
    $vars = [];
    foreach ($modules as $module => $key) {
      $definition = $angular->getModule($module);
      $factory = $definition['settingsFactory'] ?? NULL;
      $vars[$key] = is_callable($factory) ? $factory() : [];
      \Civi::resources()->addPermissions(array_values(array_filter(
        (array) ($definition['permissions'] ?? []),
        'is_string',
      )));
    }
    \Civi::resources()->addVars('afreactAdmin', $vars);
  }

}
