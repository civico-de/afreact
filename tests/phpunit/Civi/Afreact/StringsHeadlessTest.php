<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Core\Locale;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * The build lists the bundle's ts() texts; the page gets the translations core has for them.
 *
 * @group headless
 */
class StringsHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  public function testTheBuildListsTheBundlesTexts(): void {
    $texts = Strings::texts();
    $this->assertArrayHasKey('Open in the classic builder', $texts);
    $this->assertArrayHasKey('Form "%1" does not exist or you may not open it.', $texts);
    $this->assertArrayNotHasKey('', $texts);
  }

  public function testTheBuildKeepsEachPluralWithItsSingular(): void {
    $texts = Strings::texts();
    $this->assertSame('%count tags removed.', $texts['1 tag removed.'] ?? NULL);
    $this->assertSame('Skip contacts with open cases', $texts['Skip contact with open case'] ?? NULL);
    $this->assertNull($texts['Open in the classic builder']);
    $this->assertArrayNotHasKey('%count tags removed.', $texts);
  }

  /**
   * deviation:select-placeholder-text
   */
  public function testThePlaceholderComesFromAfreactsOwnTranslation(): void {
    $this->assertArrayHasKey('Select…', Strings::texts());
    // A locale object skips negotiation, which needs core's language files for German.
    \CRM_Core_I18n::singleton()->setLocale(new Locale(['nominal' => 'de_DE', 'ts' => 'de_DE']));
    try {
      Strings::add(Strings::DOMAINS['search_kit']);
    }
    finally {
      \CRM_Core_I18n::singleton()->setLocale('en_US');
    }
    $strings = \Civi::resources()->getSettings()['strings'] ?? [];
    $this->assertIsArray($strings);
    $this->assertSame('Auswählen …', $strings['Select…'] ?? NULL);
  }

  /**
   * A search display on a form takes its texts from SearchKit's catalog, as core's does.
   */
  public function testAFormFindsTextsCoreTranslatesForItsOtherScreens(): void {
    $strings = self::addInGerman('search_kit.mo', ['%1 results' => '%1 Ergebnisse']);
    $this->assertSame('%1 Ergebnisse', $strings['%1 results'] ?? NULL);
  }

  public function testAPluralGetsBothFormsWhereCoreTranslatesThem(): void {
    if (!method_exists(\CRM_Utils_JS::class, 'translateStrings')) {
      $this->markTestSkipped('This core looks plural forms up as unrelated texts.');
    }
    $strings = self::addInGerman('search_kit.mo', [
      "1 tag removed.\0%count tags removed." => "1 Tag entfernt.\0%count Tags entfernt.",
    ]);
    $this->assertSame('1 Tag entfernt.', $strings['1 tag removed.'] ?? NULL);
    $this->assertSame('%count Tags entfernt.', $strings['%count tags removed.'] ?? NULL);
  }

  /**
   * The strings a German page gets with a core catalog holding the given translations.
   *
   * @param array<string, string> $translations
   * @return array<string, string>
   */
  private static function addInGerman(string $file, array $translations): array {
    $dir = \CRM_Core_I18n::getResourceDir() . 'de_DE/LC_MESSAGES/';
    $mo = $dir . $file;
    self::assertFileDoesNotExist($mo);
    $created = !is_dir($dir);
    if ($created) {
      mkdir($dir, 0o777, TRUE);
    }
    file_put_contents($mo, self::catalog($translations));
    // A fresh German translator, which looks for the catalog again.
    unset(\Civi::$statics['CRM_Core_I18n']['singleton']['de_DE'], \Civi::$statics[Strings::class . ':']);
    \CRM_Core_I18n::singleton()->setLocale(new Locale(['nominal' => 'de_DE', 'ts' => 'de_DE']));
    try {
      Strings::add();
    }
    finally {
      \CRM_Core_I18n::singleton()->setLocale('en_US');
      unlink($mo);
      if ($created) {
        rmdir($dir);
        rmdir(dirname($dir));
      }
      unset(\Civi::$statics['CRM_Core_I18n']['singleton']['de_DE']);
    }
    $strings = \Civi::resources()->getSettings()['strings'] ?? [];
    self::assertIsArray($strings);
    return $strings;
  }

  /**
   * A gettext catalog (.mo) of the given translations.
   *
   * @param array<string, string> $translations
   */
  private static function catalog(array $translations): string {
    $translations =
      ['' => "Content-Type: text/plain; charset=UTF-8\nPlural-Forms: nplurals=2; plural=(n != 1);\n"] + $translations;
    ksort($translations, SORT_STRING);
    $count = count($translations);
    $offset = 28 + (16 * $count);
    $tables = ['', ''];
    $data = '';
    foreach ([array_keys($translations), array_values($translations)] as $side => $texts) {
      foreach ($texts as $text) {
        $tables[$side] .= pack('VV', strlen($text), $offset + strlen($data));
        $data .= $text . "\0";
      }
    }
    return pack('VVVVVVV', 0x9504_12DE, 0, $count, 28, 28 + (8 * $count), 0, 0) . $tables[0] . $tables[1] . $data;
  }

}
