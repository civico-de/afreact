<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * Core Angular module settings and permissions for a React builder route.
 */
final class AdminSettings {

  /**
   * Core Angular modules whose settingsFactory supplies vars for each route or builder.
   */
  private const MODULES = [
    'civicrm/admin/afform/submissions' => ['crmSearchDisplay' => 'searchDisplay'],
    'civicrm/search' => ['crmSearchTasks' => 'searchTasks', 'crmSearchDisplay' => 'searchDisplay'],
    'search_kit' => [
      'crmSearchAdmin' => 'searchAdmin',
      'crmSearchTasks' => 'searchTasks',
      'crmSearchDisplay' => 'searchDisplay',
    ],
    'afform' => ['afAdmin' => 'afAdmin', 'afGuiEditor' => 'afGuiEditor', 'crmMonaco' => 'monaco'],
  ];

  public static function load(string $builder, string $route = ''): void {
    $modules = self::MODULES[$route] ?? self::MODULES[$builder] ?? [];
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
    if (isset($modules['afGuiEditor'])) {
      // The canvas renders core's af-gui-* markup, styled by the editor module's stylesheet.
      \Civi::resources()->addStyleFile('org.civicrm.afform_admin', 'ang/afGuiEditor.css');
      $vars['attributeTypes'] = Afforms::cached(
        'attributeTypes',
        static fn (): array => (new AttributeSchema())->attributeTypes(),
      );
    }
    \Civi::resources()->addVars('afreactAdmin', $vars);
  }

}
