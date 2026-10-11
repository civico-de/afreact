<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Core\Event\GenericHookEvent;
use Civi\Core\Service\AutoSubscriber;

/**
 * For the builders taken over, core's routes run AdminPage and core's page classes move to the
 * classic routes; every Angular module naming a moved path in `basePages` follows them.
 */
final class BuilderRoutes extends AutoSubscriber {

  public static function getSubscribedEvents(): array {
    return [
      'hook_civicrm_alterMenu' => ['onAlterMenu', Takeover::AFTER_CORE],
      'hook_civicrm_angularModules' => ['onAngularModules', Takeover::AFTER_CORE],
    ];
  }

  public static function onAlterMenu(GenericHookEvent $e): void {
    $items = &$e->items;
    if (!is_array($items)) {
      return;
    }
    foreach (Builders::moved() as $path => $classic) {
      $item = $items[$path] ?? NULL;
      if (!is_array($item)) {
        continue;
      }
      $items[$classic] = $item;
      $item['page_callback'] = AdminPage::CALLBACK;
      unset($item['page_arguments']);
      $items[$path] = $item;
    }
  }

  public static function onAngularModules(GenericHookEvent $e): void {
    $moved = Builders::moved();
    $modules = &$e->angularModules;
    if ($moved === [] || !is_array($modules)) {
      return;
    }
    foreach ($modules as &$module) {
      if (!is_array($module) || !is_array($module['basePages'] ?? NULL)) {
        continue;
      }
      $module['basePages'] = array_map(
        static fn (mixed $page): mixed => is_string($page) ? $moved[$page] ?? $page : $page,
        $module['basePages'],
      );
    }
  }

}
