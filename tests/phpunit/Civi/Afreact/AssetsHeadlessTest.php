<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afreact;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use CRM_Afreact_ExtensionUtil as E;
use PHPUnit\Framework\TestCase;

/**
 * What the page hands <afreact-form source="page|bundle">.
 *
 * @group headless
 */
class AssetsHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  protected function setUp(): void {
    parent::setUp();
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = ['access CiviCRM'];
    // Page settings live in this region and merge across calls.
    \CRM_Core_Region::instance('html-header')->clear();
  }

  public function testPageSourceEmbedsWhatGetFormReturns(): void {
    Assets::layouts('page', Pages::FORMS);
    $layouts = $this->vars()['layouts'];
    $this->assertSame(Pages::FORMS, array_keys($layouts));
    $this->assertSame(
      Afreact::getForm()->setName('afformAfreactDemoContact')->execute()->single(),
      $layouts['afformAfreactDemoContact'],
    );
  }

  public function testPageSourceLeavesOutFormsTheUserMayNotOpen(): void {
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = [];
    Assets::layouts('page', Pages::FORMS);
    $this->assertSame([], $this->vars()['layouts']);
  }

  public function testBundleSourceNamesTheModuleFileWithEmbeddedBlocks(): void {
    Assets::layouts('bundle', Pages::FORMS);
    $bundle = $this->vars()['bundle'];
    $this->assertSame(
      [
        'module' => 'afformAfreactDemoContact',
        'title' => 'Afreact demo contact',
        'type' => 'form',
        'autosave_draft' => FALSE,
        'meta' => Afforms::meta('afformAfreactDemoContact'),
      ],
      $bundle['forms']['afformAfreactDemoContact'],
    );
    $this->assertSame(['afblock-contact-email' => 'afblockContactEmail'], $bundle['blocks']);
    $this->assertStringContainsString('angular-modules', $bundle['url']);
    $this->assertSame('js', $bundle['attributeTypes']['af-field']['defn']);
    $this->assertSame('text', $bundle['attributeTypes']['*']['*']);
  }

  public function testBundleSourceLeavesOutFormsTheUserMayNotOpen(): void {
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = [];
    Assets::layouts('bundle', Pages::FORMS);
    $bundle = $this->vars()['bundle'];
    $this->assertSame([], $bundle['forms']);
    $this->assertNull($bundle['url']);
  }

  public function testLoadHandsLocationFieldsTheSitesDistanceUnit(): void {
    $country = \Civi::settings()->get('defaultContactCountry');
    try {
      // 1228 is the United States, 1082 Germany.
      \Civi::settings()->set('defaultContactCountry', '1228');
      Assets::load();
      $this->assertSame('miles', $this->vars()['distanceUnit']);
      \Civi::settings()->set('defaultContactCountry', '1082');
      Assets::load();
      $this->assertSame('km', $this->vars()['distanceUnit']);
    }
    finally {
      \Civi::settings()->set('defaultContactCountry', $country);
    }
  }

  public function testLoadPreloadsTheChunksTheBundleImports(): void {
    Assets::load();
    $markup = '';
    foreach (\CRM_Core_Region::instance('html-header')->getAll() as $snippet) {
      $markup .= $snippet['markup'] ?? '';
    }
    preg_match_all('~<link rel="modulepreload" href="([^"]+)">~', $markup, $links);
    $chunks = array_map(static fn (string $url): string => basename($url), $links[1]);
    $entry = (string) file_get_contents(E::path('dist/afreact.js'));
    $this->assertStringContainsString('from"./chunks/' . $chunks[0] . '"', $entry);
    $this->assertCount(substr_count($entry, 'from"./chunks/'), $chunks);
    // Lazy chunks stay lazy.
    $this->assertNotContains('AfreactCompare', array_map(
      static fn (string $c): string => explode('-', $c)[0],
      $chunks,
    ));
  }

  public function testLoadHandsChartsChartKitsAssetsInBundleOrder(): void {
    Assets::load();
    $chartKit = $this->vars()['chartKit'];
    $this->assertCount(13, $chartKit['scripts']);
    // d3, dc and crossfilter first, the element last.
    $this->assertStringContainsString('chart_kit.js', $chartKit['scripts'][0]);
    $this->assertStringContainsString('/js/components/civi-search-display-chart-kit.js?', end($chartKit['scripts']));
    $this->assertStringContainsString('/ang/crmChartKit.css', $chartKit['styles'][0]);
    $this->assertStringContainsString('chart_kit.css', $chartKit['styles'][1]);
  }

  public function testLoadSkipsDisabledBundleEntries(): void {
    $chartKit = $this->withBundle(static function (\CRM_Core_Resources_Bundle $bundle): void {
      $bundle->addStyleUrl('https://example.org/dropped.css', ['disabled' => TRUE]);
      $bundle->addStyleFile('chart_kit', 'ang/crmChartKit.css');
    });
    $this->assertNotContains('https://example.org/dropped.css', $chartKit['styles']);
    $this->assertCount(3, $chartKit['styles']);
  }

  public function testABundleEntryTheRendererCannotLoadReachesOnlyTheCharts(): void {
    $chartKit = $this->withBundle(static function (\CRM_Core_Resources_Bundle $bundle): void {
      $bundle->addMarkup('<p></p>');
    });
    $this->assertSame(
      ['error' => 'chart_kit\'s bundle has a resource the renderer cannot load: "markup"'],
      $chartKit,
    );
    $this->assertArrayHasKey('distanceUnit', $this->vars());
  }

  public function testUnknownSourceIsRejected(): void {
    $this->expectExceptionMessage('Unknown layout source "file".');
    Assets::layouts('file', Pages::FORMS);
  }

  /**
   * The chartKit var while a hook adds to chart_kit's bundle.
   *
   * @return array<string, mixed>
   */
  private function withBundle(callable $alter): array {
    $listener = static function (\Civi\Core\Event\GenericHookEvent $event) use ($alter): void {
      if ($event->bundle->name === 'chart_kit') {
        $alter($event->bundle);
      }
    };
    \Civi::dispatcher()->addListener('hook_civicrm_alterBundle', $listener);
    try {
      Assets::load();
      return $this->vars()['chartKit'];
    }
    finally {
      \Civi::dispatcher()->removeListener('hook_civicrm_alterBundle', $listener);
    }
  }

  /**
   * @return array<string, mixed>
   */
  private function vars(): array {
    $vars = \Civi::resources()->getSettings()['vars']['afreact'] ?? NULL;
    $this->assertIsArray($vars);
    return $vars;
  }

}
