<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use Civi\Core\Event\GenericHookEvent;
use Civi\Core\Resolver;
use Civi\Core\Service\AutoSubscriber;

/**
 * Dashlets of listed forms on core's dashboard: the partial core writes for their directive
 * holds the React element instead, and their Angular modules are not loaded there.
 */
final class Dashlets extends AutoSubscriber {

  public const MODULE = 'crmDashboard';

  /**
   * After CRM_Core_BAO_Dashboard::addDashboardModuleDependencies (-2000).
   */
  public const AFTER_CORE_DEPENDENCIES = -2100;

  /**
   * Where the wrapped partialsCallback is kept in the module definition.
   */
  public const CORE_PARTIALS = 'afreactCorePartialsCallback';

  public static function getSubscribedEvents(): array {
    return [
      'hook_civicrm_angularModules' => ['onAngularModules', self::AFTER_CORE_DEPENDENCIES],
      'hook_civicrm_pageRun' => ['onPageRun', Takeover::AFTER_CORE],
    ];
  }

  /**
   * @return array<string, array{directive: string, module: string}>
   *   Listed forms placed as dashlets, by name.
   */
  public static function forms(): array {
    $listed = Takeover::forms();
    if ($listed === []) {
      return [];
    }
    $forms = [];
    $records = Afform::get(checkPermissions: FALSE)
      ->addWhere('name', 'IN', $listed)
      ->addWhere('placement', 'CONTAINS', 'dashboard_dashlet')
      ->addSelect('name', 'directive_name', 'module_name', 'placement')
      ->execute();
    foreach ($records as $form) {
      $forms[Afforms::field($form, 'name')] = [
        'directive' => Afforms::field($form, 'directive_name'),
        'module' => Afforms::field($form, 'module_name'),
      ];
    }
    return $forms;
  }

  public static function onAngularModules(GenericHookEvent $e): void {
    $modules = &$e->angularModules;
    $dashboard = is_array($modules) ? $modules[self::MODULE] ?? NULL : NULL;
    $forms = self::forms();
    if (!is_array($dashboard) || !isset($dashboard['partialsCallback']) || $forms === []) {
      return;
    }
    $requires = is_array($dashboard['requires'] ?? NULL) ? $dashboard['requires'] : [];
    $dashboard['requires'] = array_values(array_diff($requires, array_column($forms, 'module')));
    $dashboard[self::CORE_PARTIALS] = $dashboard['partialsCallback'];
    $dashboard['partialsCallback'] = [self::class, 'partials'];
    $modules[self::MODULE] = $dashboard;
  }

  /**
   * Core's dashlet partials, with the React element for listed forms.
   *
   * @param array<mixed> $module
   * @return array<string, string>
   */
  public static function partials(string $moduleName, array $module): array {
    $react = [];
    foreach (self::forms() as $name => $form) {
      $react["~/{$moduleName}/directives/{$form['directive']}.html"] = sprintf(
        '<afreact-form name="%s"></afreact-form>',
        htmlspecialchars($name),
      );
    }
    $partials = Resolver::singleton()->call($module[self::CORE_PARTIALS] ?? NULL, [$moduleName, $module]);
    if (!is_array($partials)) {
      throw new \CRM_Core_Exception("The partials callback of {$moduleName} returned no list.");
    }
    $result = [];
    foreach ($partials as $path => $html) {
      if (!is_string($html)) {
        throw new \CRM_Core_Exception("Partial {$path} of {$moduleName} is no string.");
      }
      $result[(string) $path] = $react[$path] ?? $html;
    }
    return $result;
  }

  public static function onPageRun(GenericHookEvent $e): void {
    if ($e->page instanceof \CRM_Contact_Page_DashBoard && self::forms() !== []) {
      Assets::load();
    }
  }

  /**
   * The dashboard's modules and partials follow the setting, as they follow a saved Afform.
   */
  public static function clearAngular(): void {
    Afforms::angular()->clear();
    \CRM_Core_Resources::singleton()->resetCacheCode();
  }

}
