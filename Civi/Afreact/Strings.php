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
   * Adds the translations, in afreact's own first (l10n/), then in `$domain` where one is given,
   * then in core's.
   */
  public static function add(?string $domain = NULL): void {
    // Each element on a page loads the assets.
    $key = self::class . ':' . ($domain ?? '');
    if (isset(\Civi::$statics[$key])) {
      return;
    }
    \Civi::$statics[$key] = TRUE;
    $translations = [];
    foreach (self::texts() as $text) {
      $translated = _ts($text, ['domain' => array_unique([E::LONG_NAME, $domain, NULL]), 'raw' => TRUE]);
      if (is_string($translated) && $translated !== $text) {
        $translations[$text] = $translated;
      }
    }
    if ($translations !== []) {
      \Civi::resources()->addSetting(['strings' => $translations]);
    }
  }

  /**
   * @return list<string>
   */
  public static function texts(): array {
    $json = file_get_contents(E::path('dist/strings.json'));
    if ($json === FALSE) {
      throw new \CRM_Core_Exception('dist/strings.json is missing; run bun run build.');
    }
    $texts = json_decode($json, TRUE, 2, JSON_THROW_ON_ERROR);
    return is_array($texts) ? array_values(array_filter($texts, 'is_string')) : [];
  }

}
