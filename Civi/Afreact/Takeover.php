<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;

/**
 * The `afreact_forms` setting: the forms React renders wherever core places them.
 *
 * FormPage takes over their pages, Placements their tabs and ContactLayout blocks,
 * PlacedSnippets their summary blocks and Dashlets their dashlets. Each runs after core's
 * listeners (placement listeners at 0, hook functions at -100, the dashboard's modules at
 * -2000) and replaces only what core put there.
 */
final class Takeover {

  public const SETTING = 'afreact_forms';

  /**
   * Listener priority after core's.
   */
  public const AFTER_CORE = -200;

  /**
   * Core's template for a placed form, and afreact's, which reads the form name from `afreact`.
   */
  public const CORE_INLINE_TEMPLATE = 'afform/InlineAfform.tpl';

  public const INLINE_TEMPLATE = 'afreact/InlineAfform.tpl';

  /**
   * @return list<string>
   *   Names of the forms React renders.
   */
  public static function forms(): array {
    $forms = \Civi::settings()->get(self::SETTING);
    return is_array($forms) ? array_values(array_filter($forms, 'is_string')) : [];
  }

  /**
   * Options of the setting: every form but blocks, which core only places inside other forms.
   *
   * @return array<string, string>
   */
  public static function formOptions(): array {
    $options = [];
    $forms = Afform::get(checkPermissions: FALSE)
      ->addWhere('type', '!=', 'block')
      ->addSelect('name', 'title')
      ->addOrderBy('title')
      ->execute();
    foreach ($forms as $form) {
      $name = Afforms::field($form, 'name');
      $title = is_array($form) && is_string($form['title'] ?? NULL) ? $form['title'] : '';
      $options[$name] = $title === '' ? $name : "{$title} ({$name})";
    }
    return $options;
  }

  /**
   * @return array<string, string>
   *   Angular module name => form name, for the listed forms.
   */
  public static function modules(): array {
    $forms = self::forms();
    if ($forms === []) {
      return [];
    }
    $modules = [];
    $records = Afform::get(checkPermissions: FALSE)
      ->addWhere('name', 'IN', $forms)
      ->addSelect('name', 'module_name')
      ->execute();
    foreach ($records as $form) {
      $modules[Afforms::field($form, 'module_name')] = Afforms::field($form, 'name');
    }
    return $modules;
  }

  /**
   * Rebuilds the routes at once, as core's settings forms do; a cleared table would be rebuilt
   * by every request that finds it empty, racing the pages served meanwhile.
   */
  public static function rebuildMenu(): void {
    \CRM_Core_Menu::store();
  }

}
