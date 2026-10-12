<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Afform\Behavior\ContactAutofillBasedOnCase;
use Civi\Angular\ChangeSet;
use Civi\Angular\Coder;
use Civi\Core\AssetBuilder;
use Civi\Core\Event\GenericHookEvent;

/**
 * The support report's builders section: what core's classic builder page carries that the
 * React builder does not know, so a site sees what it would hand to the classic builder.
 */
final class BuilderReport {

  /**
   * Core's builder modules, whose partials the React builder rebuilds.
   */
  private const BUILDER_MODULES = [
    'search_kit' => ['crmSearchAdmin', 'crmChartKitAdmin', 'crmSearchPage'],
    'afform' => ['afAdmin', 'afGuiEditor'],
  ];

  /**
   * Core's own ChangeSets on the builder modules' partials, applied before the comparison.
   */
  private const CORE_CHANGESETS = ['afform' => ['afformAdmin']];

  /**
   * @return array{modules: list<string>, partials: list<string>, replaced: list<string>}
   *   As the React builder sees them: the foreign modules it loads, islands included, as they may
   *   change more than their display editors; the builder modules' changed partials; and, apart,
   *   the modules and ChangeSets other extensions' builder panels replace.
   */
  public static function check(string $builder): array {
    return [
      'modules' => ForeignModules::of($builder),
      'partials' => self::partials($builder),
      'replaced' => BuilderPanels::replaced($builder),
    ];
  }

  /**
   * The builder modules' partials other extensions changed, which the React builder does not run,
   * less those only the ChangeSets their elements replace changed.
   *
   * @return list<string>
   */
  public static function partials(string $builder): array {
    return self::changedPartials($builder, BuilderPanels::replaced($builder));
  }

  /**
   * Partials whose content in the module asset, where ChangeSets and buildAsset listeners leave
   * it, differs from the file both verbatim and re-encoded, as a ChangeSet re-encodes every match,
   * and from the file as the named ChangeSets alone leave it.
   *
   * @param list<string> $replaced
   * @return list<string>
   */
  private static function changedPartials(string $builder, array $replaced = []): array {
    $angular = Afforms::angular();
    $modules = self::BUILDER_MODULES[$builder] ?? [];
    $replaced = [...(self::CORE_CHANGESETS[$builder] ?? []), ...$replaced];
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
    $replacedSets = array_intersect_key($angular->getChangeSets(), array_flip($replaced));
    $changed = [];
    foreach ($modules as $module) {
      $served = Record::array(Record::array($asset, $module), 'partials');
      $files = $angular->getRawPartials($module);
      $expected = self::coreRewrites(
        $module,
        (array) ChangeSet::applyResourceFilters($replacedSets, 'partials', $files),
      );
      foreach (array_keys($served + $files) as $partial) {
        $html = $served[$partial] ?? NULL;
        $file = $files[$partial] ?? NULL;
        if (
          !is_string($html)
          || !is_string($file)
          || !in_array($html, [$file, $coder->recode($file), $expected[$partial] ?? NULL], TRUE)
        ) {
          $changed[] = (string) $partial;
        }
      }
    }
    sort($changed);
    return $changed;
  }

  /**
   * The partials as core's own `angular-modules.json` rewrites leave them: civi_case appends its
   * case-role settings to the relationship autofill.
   *
   * @param array<mixed> $partials
   * @return array<mixed>
   */
  private static function coreRewrites(string $module, array $partials): array {
    // civi_case's classes load only while it is enabled.
    if (!class_exists(ContactAutofillBasedOnCase::class)) {
      return $partials;
    }
    $event = GenericHookEvent::create([
      'asset' => 'angular-modules.json',
      'content' => json_encode([$module => ['partials' => $partials]], JSON_THROW_ON_ERROR),
    ]);
    ContactAutofillBasedOnCase::onBuildAsset($event);
    $json = json_decode(
      Record::string(['content' => $event->content], 'content') ?? '',
      TRUE,
      flags: JSON_THROW_ON_ERROR,
    );
    return Record::array(Record::array($json, $module), 'partials');
  }

}
