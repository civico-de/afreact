<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use CRM_Afreact_ExtensionUtil as E;

/**
 * The `afreact_builders` setting: the builders whose core routes open React's builder.
 *
 * Core's page classes move to a classic route beside each path (BuilderRoutes).
 */
final class Builders {

  public const SETTING = 'afreact_builders';

  public const CLASSIC = '/classic';

  /**
   * Core's routes of each builder.
   */
  public const PATHS = [
    'search_kit' => ['civicrm/admin/search', 'civicrm/search'],
    'afform' => ['civicrm/admin/afform', 'civicrm/admin/afform/submissions'],
  ];

  /**
   * @return list<string>
   *   The builders React takes over.
   */
  public static function takenOver(): array {
    $builders = \Civi::settings()->get(self::SETTING);
    return (
      is_array($builders)
        ? array_values(array_intersect(self::available(), array_filter($builders, 'is_string')))
        : []
    );
  }

  /**
   * @return array<string, string>
   *   Core path => its classic path, for the builders taken over.
   */
  public static function moved(): array {
    $moved = [];
    foreach (self::takenOver() as $builder) {
      foreach (self::PATHS[$builder] as $path) {
        $moved[$path] = $path . self::CLASSIC;
      }
    }
    return $moved;
  }

  /**
   * @return array<string, string>
   */
  public static function options(): array {
    $labels = ['search_kit' => E::ts('SearchKit'), 'afform' => E::ts('FormBuilder')];
    return array_intersect_key($labels, array_flip(self::available()));
  }

  /**
   * @return list<string>
   *   The builders whose core screens the site has: FormBuilder's come with afform_admin.
   */
  public static function available(): array {
    $mapper = \CRM_Extension_System::singleton()->getMapper();
    return array_values(array_filter(
      array_keys(self::PATHS),
      static fn (string $builder): bool => $builder !== 'afform' || $mapper->isActiveModule('afform_admin'),
    ));
  }

  /**
   * The builder whose core or classic route `$path` is, or NULL.
   */
  public static function builderOf(string $path): ?string {
    foreach (self::PATHS as $builder => $paths) {
      if (in_array($path, $paths, TRUE)) {
        return $builder;
      }
    }
    return NULL;
  }

  /**
   * Routes and the cached module list both hold the takeover.
   */
  public static function rebuild(): void {
    Takeover::rebuildMenu();
    Dashlets::clearAngular();
  }

}
