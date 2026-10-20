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
    $this->assertContains('Open in the classic builder', $texts);
    $this->assertContains('Form "%1" does not exist or you may not open it.', $texts);
    $this->assertNotContains('', $texts);
  }

  /**
   * deviation:select-placeholder-text
   */
  public function testThePlaceholderComesFromAfreactsOwnTranslation(): void {
    $this->assertContains('Select…', Strings::texts());
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

}
