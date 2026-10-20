<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Core\AssetBuilder;

/**
 * What core's AngularLoader would add to a page for some Angular modules, as URLs and settings an
 * island loads on demand; AngularJS itself is on every page (CRM_Core_Resources::addCoreResources).
 */
final class AngularAssets {

  /**
   * The assets of `$roots` and what they require; their permissions go to the page at once.
   *
   * @param list<string> $roots
   * @return array{scripts: list<string>, styles: list<string>, settings: array<mixed>}
   */
  public static function of(array $roots): array {
    $angular = Afforms::angular();
    $modules = self::strings($angular->resolveDependencies($roots), 'module name');
    $permissions = [];
    foreach ($angular->getResources($modules, 'permissions', 'permissions') as $perms) {
      array_push($permissions, ...self::strings($perms, 'permission'));
    }
    \Civi::resources()->addPermissions(array_values(array_unique($permissions)));
    $assetBuilder = \Civi::service('asset_builder');
    if (!$assetBuilder instanceof AssetBuilder) {
      throw new \CRM_Core_Exception('The asset builder service is not available.');
    }
    $params = ['modules' => implode(',', $modules)];
    $settings = self::settings($angular, $modules);
    $settings['angular'] = [
      'modules' => $modules,
      'requires' => $angular->getResources($modules, 'requires', 'requires'),
      'cacheCode' => \Civi::resources()->getCacheCode(),
      'bundleUrl' => $assetBuilder->getUrl('angular-modules.json', $params),
    ];
    return [
      'scripts' => [$assetBuilder->getUrl('angular-modules.js', $params)],
      'styles' => self::themedStyles($angular->getResources($modules, 'css', 'relUrl')),
      'settings' => $settings,
    ];
  }

  /**
   * The modules' settings with their settings factories' output, as AngularLoader merges them.
   *
   * @param list<string> $modules
   * @return array<mixed>
   */
  private static function settings(\Civi\Angular\Manager $angular, array $modules): array {
    $settings = $angular->getResources($modules, 'settings', 'settings');
    foreach ($angular->getResources($modules, 'settingsFactory', 'settingsFactory') as $module => $factory) {
      $made = is_callable($factory) ? $factory() : NULL;
      if (!is_array($made)) {
        throw new \CRM_Core_Exception("The settings factory of the Angular module {$module} gave no array.");
      }
      $settings[$module] = array_merge(Record::array($settings, (string) $module), $made);
    }
    return $settings;
  }

  /**
   * The modules' stylesheets as the active theme serves them, as core's AngularLoader adds them
   * with addStyleFile(): a theme may replace a file (Riverlea's crmUI.css) or leave it out.
   *
   * @param array<mixed> $files
   * @return list<string>
   */
  private static function themedStyles(array $files): array {
    $themes = \Civi::service('themes');
    if (!$themes instanceof \Civi\Core\Themes) {
      throw new \CRM_Core_Exception('The themes service is not available.');
    }
    $urls = [];
    foreach ($files as $file) {
      $ext = Record::string($file, 'ext');
      $path = Record::string($file, 'file');
      if ($ext === NULL || $path === NULL) {
        throw new \CRM_Core_Exception('An Angular module names a stylesheet without its extension and file.');
      }
      array_push($urls, ...self::strings(
        $themes->resolveUrls($themes->getActiveThemeKey(), $ext, $path),
        'stylesheet URL',
      ));
    }
    return array_values(array_unique($urls));
  }

  /**
   * A list of strings, or one, as core's AngularLoader takes a module's permissions.
   *
   * @return list<string>
   */
  private static function strings(mixed $values, string $what): array {
    $strings = [];
    foreach (is_array($values) ? $values : [$values] as $value) {
      if (!is_string($value)) {
        throw new \CRM_Core_Exception("The Angular manager returned a {$what} that is not a string.");
      }
      $strings[] = $value;
    }
    return $strings;
  }

}
