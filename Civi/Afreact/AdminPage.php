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
    'civicrm/admin/afreact/afform/submissions' => 'civicrm/admin/afform/submissions',
    'civicrm/afreact/search' => 'civicrm/search',
  ];

  public static function render(): string {
    // The menu item, not the request path, which may run on below it.
    $route = self::route(Record::string(\CRM_Core_Menu::get(\CRM_Utils_System::currentPath() ?? ''), 'path') ?? '');
    $builder = Builders::builderOf($route);
    if ($builder === NULL) {
      throw new \CRM_Core_Exception('No React builder for this route.');
    }
    if (!in_array($builder, Builders::available(), TRUE)) {
      throw new \CRM_Core_Exception("The {$builder} builder's core extension is not enabled.");
    }
    $classic = \Civi::url('backend://' . self::classic($route));
    if ($route === 'civicrm/admin/afform/submissions') {
      $name = SubmissionsPage::chrome();
      if ($name !== NULL) {
        $classic->addQuery(['name' => $name]);
      }
    }
    self::load($builder, $route);
    return Chrome::page(sprintf(
      '<div id="bootstrap-theme" class="afreact-builder-page"><afreact-builder builder="%s" route="%s" classic="%s" core-version="%s"></afreact-builder></div>',
      Chrome::escape($builder),
      Chrome::escape($route),
      Chrome::escape((string) $classic),
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
  public static function load(string $builder, string $route = ''): void {
    Assets::load($builder);
    $isAdminBuilder = !in_array($route, ['civicrm/admin/afform/submissions', 'civicrm/search'], TRUE);
    $foreign = $isAdminBuilder ? ForeignModules::of($builder) : [];
    if ($foreign !== []) {
      Chrome::angular()->addModules($foreign);
    }
    \Civi::resources()->addVars('afreactAdmin', [
      'foreignModules' => $foreign,
      'changedPartials' => $isAdminBuilder ? BuilderReport::partials($builder) : [],
    ]);
    \Civi::resources()->addModuleFile(E::LONG_NAME, 'dist/afreact-admin.js');
    AdminSettings::load($builder, $route);
    Strings::add(Strings::DOMAINS[$builder] ?? NULL);
  }

}
