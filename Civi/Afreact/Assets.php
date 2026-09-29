<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use Civi\Api4\Afreact;
use Civi\API\Exception\UnauthorizedException;
use Civi\Core\AssetBuilder;
use CRM_Afreact_ExtensionUtil as E;

/**
 * Adds the React bundle, which registers the <afreact-form> and <afreact-search> elements.
 */
final class Assets {

  /**
   * Where <afreact-form source="…"> takes its layout from: the Afreact.getForm API, the page
   * itself, or the compiled Angular module file the Angular runtime loads.
   */
  public const SOURCES = ['api', 'page', 'bundle'];

  public static function load(): void {
    // Fixed file names: CiviCRM's resource cache code busts browser caches after flushes and upgrades.
    \Civi::resources()
      ->addModuleFile(E::LONG_NAME, 'dist/afreact.js')
      ->addStyleFile(E::LONG_NAME, 'dist/afreact.css')
      // The styles core's Angular modules bring for the markup the elements share with them.
      ->addStyleFile('civicrm', 'ang/crmUI.css')
      ->addStyleFile('org.civicrm.afform', 'ang/afCore.css')
      ->addStyleFile('org.civicrm.search_kit', 'css/crmSearchDisplay.css')
      ->addStyleFile('org.civicrm.search_kit', 'css/crmSearchDisplayTable.css');
  }

  /**
   * Hands the page what <afreact-form source="page|bundle"> needs for the given forms.
   *
   * Forms the user may not open are left out; the element then reports them as such.
   *
   * @param list<string> $names
   */
  public static function layouts(string $source, array $names): void {
    match ($source) {
      'api' => NULL,
      'page' => \Civi::resources()->addVars('afreact', ['layouts' => self::pageLayouts($names)]),
      'bundle' => \Civi::resources()->addVars('afreact', ['bundle' => self::bundle($names)]),
      default => throw new \CRM_Core_Exception("Unknown layout source \"{$source}\"."),
    };
  }

  /**
   * @param list<string> $names
   * @return array<string, mixed>
   */
  private static function pageLayouts(array $names): array {
    $layouts = [];
    foreach ($names as $name) {
      try {
        $layouts[$name] = Afreact::getForm()->setName($name)->execute()->single();
      }
      catch (UnauthorizedException) {
        continue;
      }
    }
    return $layouts;
  }

  /**
   * @param list<string> $names
   * @return array<string, mixed>
   */
  private static function bundle(array $names): array {
    $forms = [];
    $records = Afform::get()
      ->addSelect('name', 'module_name', 'title', 'type')
      ->addWhere('name', 'IN', $names)
      ->execute();
    foreach ($records as $form) {
      $forms[Afforms::field($form, 'name')] = [
        'module' => Afforms::field($form, 'module_name'),
        // Afform titles are optional.
        'title' => is_array($form) && is_string($form['title'] ?? NULL) ? $form['title'] : NULL,
        'type' => Afforms::field($form, 'type'),
      ];
    }
    $modules = array_column($forms, 'module');
    sort($modules);
    $embedded = Afforms::cached('bundle_' . implode(',', $modules), static fn (): array => self::withBlocks($modules));
    $assets = \Civi::service('asset_builder');
    if (!$assets instanceof AssetBuilder) {
      throw new \CRM_Core_Exception('The asset builder service is not available.');
    }
    return [
      // Core reads an empty module list as every module.
      'url' => $embedded
        ? $assets->getUrl('angular-modules.json', ['modules' => implode(',', array_keys($embedded))])
        : NULL,
      'forms' => $forms,
      'blocks' => array_flip(array_filter($embedded)),
      'attributeTypes' => Afforms::cached('attributeTypes', static fn (): array => (new AttributeSchema())->attributeTypes()),
    ];
  }

  /**
   * @param list<string> $modules
   * @return array<string, string>
   *   The modules and every block they embed, sorted so equal sets share one URL:
   *   module name => block directive name, or '' for the forms themselves.
   */
  private static function withBlocks(array $modules): array {
    $angular = Afforms::angular();
    $blocks = array_flip(Afforms::blocks());
    $found = [];
    while ($modules) {
      $module = array_pop($modules);
      if (isset($found[$module])) {
        continue;
      }
      $found[$module] = $blocks[$module] ?? '';
      $requires = $angular->getModule($module)['requires'] ?? [];
      $embedded = array_filter(
        is_array($requires) ? $requires : [],
        static fn (mixed $name) => is_string($name) && isset($blocks[$name]),
      );
      $modules = [...$modules, ...array_map('strval', array_values($embedded))];
    }
    ksort($found);
    return $found;
  }

}
