<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Esm\ImportMap;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use CRM_Afreact_ExtensionUtil as E;
use PHPUnit\Framework\TestCase;

/**
 * The kit's import map entries and what a page importing the kit gets.
 *
 * @group headless
 */
class KitHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  public function testEachModuleIsMappedWithTheCacheCode(): void {
    $importMap = \Civi::service('esm.import_map');
    $this->assertInstanceOf(ImportMap::class, $importMap);
    $prefixes = $importMap->getPrefixes();
    $this->assertArrayNotHasKey(Kit::PREFIX, $prefixes);
    $modules = Kit::modules();
    $this->assertContains('kit.js', $modules);
    $this->assertContains('react.js', $modules);
    foreach ($modules as $module) {
      $this->assertFileExists(E::path('dist/kit/' . substr($module, 0, -3) . '.d.ts'));
      $entry = $prefixes[Kit::PREFIX . $module] ?? NULL;
      $this->assertIsArray($entry, $module);
      $this->assertSame(E::LONG_NAME, $entry['ext']);
      $this->assertMatchesRegularExpression('~^dist/kit/' . preg_quote($module, '~') . '\?r=\w+$~', $entry['relPath']);
    }
  }

  public function testAPageWithoutModulesHasNoImportMap(): void {
    \Civi::resources()->addScript('window.afreactKitTest = 1;');
    $this->assertStringNotContainsString('importmap', $this->header());
  }

  public function testAPageWithAConsumerModuleCarriesTheImportMap(): void {
    \Civi::resources()->addModuleFile('afreactdemo', 'js/kit-consumer.js');
    $this->assertKitMapped($this->header());
  }

  public function testLoadAddsTheStylesheet(): void {
    Kit::load();
    $footer = \CRM_Core_Region::instance('page-footer')->render('', FALSE);
    $this->assertStringContainsString(E::url('dist/afreact.css'), $footer);
  }

  private function header(): string {
    return \CRM_Core_Region::instance('html-header')->render('', FALSE);
  }

  private function assertKitMapped(string $header): void {
    $this->assertMatchesRegularExpression('~<script type=.importmap.>~', $header);
    $relPath = \Civi::service('esm.import_map')->getPrefixes()[Kit::PREFIX . 'kit.js']['relPath'];
    $entry = json_encode(
      [Kit::PREFIX . 'kit.js' => \Civi::resources()->getUrl(E::LONG_NAME, $relPath)],
      JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
    );
    // Debug mode pretty-prints the map.
    $this->assertStringContainsString(trim($entry, '{}'), (string) preg_replace('~\s+~', '', $header));
  }

}
