<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Angular\Coder;
use Civi\Core\AssetBuilder;

/**
 * The support report's builders section: what core's classic builder page carries that the
 * React builder does not know, so a site sees what it would hand to the classic builder.
 */
final class BuilderReport {

  /**
   * The modules core's classic builder page loads that the React builder rebuilds or replaces.
   */
  private const KNOWN = [
    'search_kit' => [
      'api4',
      'checklist-model',
      'civiCaseTasks',
      'crmChartKit',
      'crmChartKitAdmin',
      'crmDialog',
      'crmEntityTags',
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
  ];

  /**
   * Core's builder modules, whose partials the React builder rebuilds.
   */
  private const BUILDER_MODULES = [
    'search_kit' => ['crmSearchAdmin', 'crmChartKitAdmin', 'crmSearchPage'],
  ];

  /**
   * @return array{modules: list<string>, partials: list<string>}
   *   Modules the classic page loads that afreact does not know, islands included, as they may
   *   change more than their display editors; and the builder modules' changed partials.
   */
  public static function check(string $builder): array {
    $angular = Afforms::angular();
    $loaded = array_filter(
      (array) $angular->resolveDependencies($angular->resolveDefaultModules(AdminPage::classic(
        Builders::PATHS[$builder][0],
      ))),
      'is_string',
    );
    $unknown = array_diff($loaded, self::KNOWN[$builder] ?? []);
    sort($unknown);
    return [
      'modules' => $unknown,
      'partials' => self::partials($builder),
    ];
  }

  /**
   * The builder modules' partials other extensions changed, which the React builder does not run.
   *
   * @return list<string>
   */
  public static function partials(string $builder): array {
    return self::changedPartials(self::BUILDER_MODULES[$builder] ?? []);
  }

  /**
   * Partials whose content in the module asset, where ChangeSets and buildAsset listeners leave
   * it, differs from the file both verbatim and re-encoded, as a ChangeSet re-encodes every match.
   *
   * @param list<string> $modules
   * @return list<string>
   */
  private static function changedPartials(array $modules): array {
    $angular = Afforms::angular();
    // chart_kit's module exists only while chart_kit is enabled.
    $modules = array_values(array_intersect($modules, array_keys($angular->getModules())));
    if ($modules === []) {
      return [];
    }
    $assets = \Civi::service('asset_builder');
    if (!$assets instanceof AssetBuilder) {
      throw new \CRM_Core_Exception('The asset builder service is not available.');
    }
    $asset = json_decode(
      Record::string($assets->render('angular-modules.json', ['modules' => implode(',', $modules)]), 'content') ?? '',
      TRUE,
      flags: JSON_THROW_ON_ERROR,
    );
    $coder = new Coder();
    $changed = [];
    foreach ($modules as $module) {
      $served = Record::array(Record::array($asset, $module), 'partials');
      $files = $angular->getRawPartials($module);
      foreach (array_keys($served + $files) as $partial) {
        $html = $served[$partial] ?? NULL;
        $file = $files[$partial] ?? NULL;
        if (!is_string($html) || !is_string($file) || $html !== $file && $html !== $coder->recode($file)) {
          $changed[] = (string) $partial;
        }
      }
    }
    sort($changed);
    return $changed;
  }

}
