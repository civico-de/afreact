<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use CRM_Afreact_ExtensionUtil as E;

/**
 * The bundle's ts() texts (dist/strings.json, written by the build) with their translations,
 * for CRM.strings: core reads ts() calls only from the script file it adds, and not at all from
 * the minified bundle's template literals.
 */
final class Strings {

  /**
   * The text domain of each builder's strings in core.
   */
  public const DOMAINS = [
    'search_kit' => 'org.civicrm.search_kit',
    'afform' => 'org.civicrm.afform_admin',
  ];

  /**
   * Core's catalogs for the screens the bundle renders: a form shows search displays, a builder
   * previews forms; each screen's core module translates in its own domain.
   */
  private const CORE_DOMAINS = ['org.civicrm.afform', 'org.civicrm.search_kit', 'org.civicrm.afform_admin'];

  /**
   * Adds the translations, in afreact's own first (l10n/), then in `$domain` where one is given,
   * then in core's catalogs for forms, searches and the form builder, then in core's own.
   */
  public static function add(?string $domain = NULL): void {
    // Each element on a page loads the assets.
    $key = self::class . ':' . ($domain ?? '');
    if (isset(\Civi::$statics[$key])) {
      return;
    }
    \Civi::$statics[$key] = TRUE;
    $translations = self::translate(
      self::texts(),
      array_values(array_unique([E::LONG_NAME, ...($domain !== NULL ? [$domain] : []), ...self::CORE_DOMAINS, NULL])),
    );
    if ($translations !== []) {
      \Civi::resources()->addSetting(['strings' => $translations]);
    }
  }

  /**
   * @param array<string, string|null> $texts
   * @param list<string|null> $domains
   * @return array<string, string>
   */
  private static function translate(array $texts, array $domains): array {
    // Older core lacks it and looks a plural's two forms up as unrelated texts.
    $coreTranslate = [\CRM_Utils_JS::class, 'translateStrings'];
    if (is_callable($coreTranslate)) {
      // @mago-expect analysis:non-existent-function -- only on core with civicrm/civicrm-core#38172
      $translations = $coreTranslate($texts, $domains);
      return is_array($translations) ? self::onlyStrings($translations) : [];
    }
    $translations = [];
    foreach ([...array_keys($texts), ...array_filter($texts)] as $text) {
      $translated = _ts($text, ['domain' => $domains, 'raw' => TRUE]);
      if (is_string($translated) && $translated !== $text) {
        $translations[$text] = $translated;
      }
    }
    return $translations;
  }

  /**
   * @param array<mixed> $translations
   * @return array<string, string>
   */
  private static function onlyStrings(array $translations): array {
    $result = [];
    foreach ($translations as $original => $translation) {
      if (!is_string($translation)) {
        continue;
      }
      $result[(string) $original] = $translation;
    }
    return $result;
  }

  /**
   * @return array<string, string|null>
   *   Each text with its plural form or NULL.
   */
  public static function texts(): array {
    $json = file_get_contents(E::path('dist/strings.json'));
    if ($json === FALSE) {
      throw new \CRM_Core_Exception('dist/strings.json is missing; run bun run build.');
    }
    $texts = json_decode($json, TRUE, 2, JSON_THROW_ON_ERROR);
    if (!is_array($texts)) {
      return [];
    }
    $result = [];
    foreach ($texts as $text => $plural) {
      $result[(string) $text] = is_string($plural) ? $plural : NULL;
    }
    return $result;
  }

}
