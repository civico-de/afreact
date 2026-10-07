<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Afform\StringVisitor;
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
    $key = 'afreact_' . md5($name . '_' . \CRM_Core_Resources::singleton()->getCacheCode());
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

  /**
   * The form metadata afform.js hands afCoreDirective, which afForm sends as `afform`
   * with crmFormSuccess and crmFormError (afform_civicrm_buildAsset()).
   *
   * @return array<mixed>
   */
  public static function meta(string $name): array {
    $record = Afform::get(checkPermissions: FALSE)
      ->addSelect('redirect', 'name', 'title', 'autosave_draft', 'confirmation_type', 'confirmation_message')
      ->addWhere('name', '=', $name)
      ->execute()
      ->first();
    if (!is_array($record)) {
      throw new \CRM_Core_Exception("The form {$name} does not exist.");
    }
    (new StringVisitor())->visitMetadata($record, '_ts');
    return $record;
  }

  public static function field(mixed $afform, string $field): string {
    $value = is_array($afform) ? $afform[$field] ?? NULL : NULL;
    if (!is_string($value)) {
      throw new \CRM_Core_Exception("Afform record without {$field}.");
    }
    return $value;
  }

  /**
   * @param list<string> $modules
   * @return array<string, string>
   *   The modules and every block they embed, sorted so equal sets share one URL:
   *   module name => block directive name, or '' for the forms themselves.
   */
  public static function withBlocks(array $modules): array {
    $angular = self::angular();
    $blocks = array_flip(self::blocks());
    $found = [];
    while ($modules) {
      $module = array_pop($modules);
      if (isset($found[$module])) {
        continue;
      }
      $found[$module] = $blocks[$module] ?? '';
      $requires = $angular->getModule($module)['requires'] ?? [];
      $named = array_flip(array_filter(is_array($requires) ? $requires : [], 'is_string'));
      $modules = [...$modules, ...array_keys(array_intersect_key($blocks, $named))];
    }
    ksort($found);
    return $found;
  }

  /**
   * The translations core sends the Angular runtime for a form's and its blocks' ts() texts.
   *
   * @return array<string, string>
   *   Original => translated, only for texts that have a translation.
   */
  public static function translatedStrings(string $module): array {
    $angular = self::angular();
    $strings = [];
    foreach (array_keys(self::withBlocks([$module])) as $name) {
      foreach ($angular->getTranslatedStrings($name) as $original => $translated) {
        if (!is_string($translated)) {
          throw new \CRM_Core_Exception("Angular module {$name} has a translation that is no string.");
        }
        $strings[(string) $original] = $translated;
      }
    }
    return $strings;
  }

}
