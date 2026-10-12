<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * The panels other extensions add to a builder page by naming their custom elements in the
 * civi.afreact.assets event, and the builder modules and ChangeSets of theirs those elements replace.
 */
final class BuilderPanels {

  /**
   * Hands a builder page the panel elements plugins named, which must be custom element names,
   * and keeps the Angular modules and ChangeSets their elements replace out of the page.
   */
  public static function add(string $builder, mixed $panels, mixed $replaces = []): void {
    if ($builder === '') {
      return;
    }
    \Civi::$statics[self::class . '::replaces:' . $builder] = (array) $replaces;
    if ($panels === []) {
      return;
    }
    $names = [];
    foreach (is_array($panels) ? $panels : [$panels] as $name) {
      if (!is_string($name) || !preg_match('/^[a-z][a-z0-9._]*-[a-z0-9._-]*$/', $name)) {
        throw new \CRM_Core_Exception(
          'A builder panel is not a custom element name: ' . var_export($name, return: TRUE),
        );
      }
      $names[$name] = $name;
    }
    \Civi::resources()->addVars('afreactAdmin', ['panels' => array_values($names)]);
  }

  /**
   * The builder modules and ChangeSet names other extensions' elements replace in `$builder`.
   *
   * @return list<string>
   */
  public static function replaced(string $builder): array {
    $replaced = \Civi::$statics[self::class . '::replaces:' . $builder] ?? [];
    return is_array($replaced) ? array_values(array_filter($replaced, 'is_string')) : [];
  }

}
