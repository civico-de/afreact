<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * Other extensions' Angular modules for core's classic builder, which the React builder loads:
 * display type editors run as islands, and modules that reach into the builder stop its saving.
 */
final class ForeignModules {

  /**
   * The modules core's classic builder page loads that the React builder rebuilds or replaces.
   */
  public const KNOWN = [
    'search_kit' => [
      'api4',
      'checklist-model',
      'civiCaseTasks',
      'civiGrantTasks',
      'crmChartKit',
      'crmChartKitAdmin',
      'crmDialog',
      'crmEntityTags',
      'crmMsgadmTasks',
      'crmResource',
      'crmRouteBinder',
      'crmSearchAdmin',
      'crmSearchDisplay',
      'crmSearchDisplayBatch',
      'crmSearchDisplayGrid',
      'crmSearchDisplayList',
      'crmSearchDisplayTable',
      'crmSearchDisplayTree',
      'crmSearchTasks',
      'crmUi',
      'crmUtil',
      'dialogService',
      'jsonFormatter',
      'md5',
      'ngRoute',
      'ngSanitize',
      'ui.bootstrap',
      'ui.sortable',
    ],
    'afform' => [
      'af',
      'afAdmin',
      'afAdminFormList',
      'afCaseGuiEditor',
      'afCheckout',
      'afCore',
      'afGuiEditor',
      'afGuiRecaptcha2',
      'angularFileUpload',
      'api4',
      'checklist-model',
      'civiCaseTasks',
      'civiGrantTasks',
      'crmChartKit',
      'crmDialog',
      'crmEntityTags',
      'crmMonaco',
      'crmMsgadmTasks',
      'crmResource',
      'crmRouteBinder',
      'crmSearchDisplay',
      'crmSearchDisplayBatch',
      'crmSearchDisplayGrid',
      'crmSearchDisplayList',
      'crmSearchDisplayTable',
      'crmSearchDisplayTree',
      'crmSearchTasks',
      'crmUi',
      'crmUtil',
      'dialogService',
      'jsonFormatter',
      'ngRoute',
      'ngSanitize',
      'ui.bootstrap',
      'ui.sortable',
    ],
  ];

  /**
   * The modules on core's classic builder page that core does not bring, with everything they
   * require: those naming its path and those added to core modules' requires, such as the
   * FormBuilder's input type admin modules. Modules in `$skipped`, and what only they require, are left out.
   *
   * @param list<string> $skipped
   * @return list<string>
   */
  private static function unknown(string $builder, array $skipped): array {
    $angular = Afforms::angular();
    $modules = $angular->getModules();
    $seen = [];
    $visit = static function (string $name) use (&$visit, &$seen, $modules, $skipped): void {
      if (isset($seen[$name]) || in_array($name, $skipped, TRUE)) {
        return;
      }
      // As core's resolveDependencies(), which the classic page runs.
      if (!isset($modules[$name])) {
        throw new \CRM_Core_Exception("Unrecognized Angular module {$name}.");
      }
      $seen[$name] = TRUE;
      array_map($visit, array_filter(Record::array($modules[$name], 'requires'), is_string(...)));
    };
    $defaults = (array) $angular->resolveDefaultModules(AdminPage::classic(Builders::PATHS[$builder][0]));
    array_map($visit, array_filter($defaults, is_string(...)));
    $unknown = array_values(array_diff(array_map(strval(...), array_keys($seen)), self::KNOWN[$builder] ?? []));
    sort($unknown);
    return $unknown;
  }

  /**
   * The foreign modules the React builder loads: those the classic page has, less the modules
   * other extensions' builder panels replace.
   *
   * @return list<string>
   */
  public static function of(string $builder): array {
    return isset(self::KNOWN[$builder]) ? self::unknown($builder, BuilderPanels::replaced($builder)) : [];
  }

}
