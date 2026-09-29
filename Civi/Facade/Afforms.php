<?php

declare(strict_types = 1);

namespace Civi\Facade;

use Civi\Angular\Manager;
use Civi\Api4\Afform;

/**
 * Typed access to Afform records, core's Angular manager and its cache.
 */
final class Afforms {

  /**
   * Caches a value that is the same for every user in core's Angular cache, which
   * saving a form, custom field changes and cache flushes clear.
   *
   * @template T
   * @param callable(): T $build
   * @return T
   */
  public static function cached(string $name, callable $build): mixed {
    $cache = \CRM_Utils_Cache::create([
      'scope' => 'version',
      'name' => 'angular',
      'type' => ['*memory*', 'SqlGroup', 'ArrayCache'],
      'withArray' => 'fast',
    ]);
    // The resource cache code changes on flush and carries the locale.
    $key = 'facade_' . md5($name . '_' . \CRM_Core_Resources::singleton()->getCacheCode());
    if ($cache->has($key)) {
      /** @var T */
      return $cache->get($key);
    }
    $value = $build();
    $cache->set($key, $value);
    return $value;
  }

  public static function angular(): Manager {
    $angular = \Civi::service('angular');
    if (!$angular instanceof Manager) {
      throw new \CRM_Core_Exception('The Angular manager service is not available.');
    }
    return $angular;
  }

  /**
   * @return array<string, string>
   *   Block directive name => Angular module name.
   */
  public static function blocks(): array {
    $blocks = [];
    $records = Afform::get(checkPermissions: FALSE)
      ->addWhere('type', '=', 'block')
      ->addSelect('directive_name', 'module_name')
      ->execute();
    foreach ($records as $block) {
      $blocks[self::field($block, 'directive_name')] = self::field($block, 'module_name');
    }
    return $blocks;
  }

  public static function field(mixed $afform, string $field): string {
    $value = is_array($afform) ? $afform[$field] ?? NULL : NULL;
    if (!is_string($value)) {
      throw new \CRM_Core_Exception("Afform record without {$field}.");
    }
    return $value;
  }

}
