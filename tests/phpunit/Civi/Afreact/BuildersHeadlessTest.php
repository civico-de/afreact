<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Core\Event\GenericHookEvent;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use CRM_Afreact_ExtensionUtil as E;
use PHPUnit\Framework\TestCase;

/**
 * Builders in afreact_builders open React at core's routes; core's pages move to classic routes.
 *
 * Not transactional: changing the setting rebuilds civicrm_menu by TRUNCATE, which commits.
 *
 * @group headless
 */
class BuildersHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  private ?\Closure $island = NULL;

  protected function tearDown(): void {
    if ($this->island) {
      \Civi::dispatcher()->removeListener('hook_civicrm_angularModules', $this->island);
      Afforms::angular()->clear();
    }
    \Civi::settings()->set(Builders::SETTING, []);
    parent::tearDown();
  }

  /**
   * @return array<string, mixed>
   */
  private static function basePages(string $module): array {
    $modules = Afforms::angular()->getModules();
    return (array) ($modules[$module]['basePages'] ?? []);
  }

  public function testSearchKitTakeoverMovesPagesAndTheirModules(): void {
    $this->assertSame('CRM_Search_Page_Admin', \CRM_Core_Menu::get('civicrm/admin/search')['page_callback']);
    $this->assertContains('civicrm/admin/search', self::basePages('crmSearchAdmin'));
    $this->assertSame('civicrm/search', AdminPage::classic('civicrm/search'));

    \Civi::settings()->set(Builders::SETTING, ['search_kit']);
    $this->assertSame('civicrm/search/classic', AdminPage::classic('civicrm/search'));
    $this->assertSame(AdminPage::CALLBACK, \CRM_Core_Menu::get('civicrm/admin/search')['page_callback']);
    $this->assertSame(AdminPage::CALLBACK, \CRM_Core_Menu::get('civicrm/search')['page_callback']);
    $this->assertSame('CRM_Search_Page_Admin', \CRM_Core_Menu::get('civicrm/admin/search/classic')['page_callback']);
    $this->assertSame('CRM_Search_Page_Search', \CRM_Core_Menu::get('civicrm/search/classic')['page_callback']);
    $this->assertSame(['civicrm/admin/search/classic'], self::basePages('crmSearchAdmin'));
    $this->assertSame(['civicrm/search/classic'], self::basePages('crmSearchPage'));
    $this->assertSame(['civicrm/admin/search/classic'], self::basePages('crmChartKitAdmin'));
    // FormBuilder stays core's.
    $this->assertSame('CRM_AfformAdmin_Page_Base', \CRM_Core_Menu::get('civicrm/admin/afform')['page_callback']);
    $this->assertContains('civicrm/admin/afform', self::basePages('afAdmin'));

    \Civi::settings()->set(Builders::SETTING, []);
    $this->assertSame('CRM_Search_Page_Admin', \CRM_Core_Menu::get('civicrm/admin/search')['page_callback']);
    $this->assertSame(['civicrm/admin/search'], self::basePages('crmSearchAdmin'));
  }

  public function testIslandsAreOtherExtensionsSearchBuilderModulesWithAndWithoutTakeover(): void {
    // Core's own and chart_kit's, which React edits itself, are no islands.
    $this->assertSame([], ForeignModules::of('search_kit'));

    $this->island = static function (GenericHookEvent $e): void {
      $e->angularModules['afreactTestIsland'] = [
        'ext' => E::LONG_NAME,
        'js' => [],
        'requires' => ['crmSearchAdmin'],
        'basePages' => ['civicrm/admin/search'],
      ];
    };
    \Civi::dispatcher()->addListener('hook_civicrm_angularModules', $this->island);
    Afforms::angular()->clear();
    $this->assertSame(['afreactTestIsland'], ForeignModules::of('search_kit'));
    \Civi::settings()->set(Builders::SETTING, ['search_kit']);
    Afforms::angular()->clear();
    $this->assertSame(['afreactTestIsland'], ForeignModules::of('search_kit'));
  }

  public function testFormBuilderTakeoverTakesItsModulesAndSubmissions(): void {
    \Civi::settings()->set(Builders::SETTING, ['afform']);
    $this->assertSame(AdminPage::CALLBACK, \CRM_Core_Menu::get('civicrm/admin/afform')['page_callback']);
    $this->assertSame(AdminPage::CALLBACK, \CRM_Core_Menu::get('civicrm/admin/afform/submissions')['page_callback']);
    $this->assertSame(
      'CRM_AfformAdmin_Page_Base',
      \CRM_Core_Menu::get('civicrm/admin/afform/classic')['page_callback'],
    );
    $this->assertSame(
      'CRM_AfformAdmin_Page_Submissions',
      \CRM_Core_Menu::get('civicrm/admin/afform/submissions/classic')['page_callback'],
    );
    foreach (['afAdmin', 'afGuiEditor', 'afCaseGuiEditor', 'afGuiRecaptcha2'] as $module) {
      $this->assertNotContains('civicrm/admin/afform', self::basePages($module), $module);
    }
    $this->assertContains('civicrm/admin/afform/classic', self::basePages('afAdmin'));
  }

  public function testTheSettingOffersTheBuildersWhosePhasesAreDone(): void {
    $this->assertSame(['search_kit' => 'SearchKit', 'afform' => 'FormBuilder'], Builders::options());
  }

  public function testUnknownBuildersAreIgnored(): void {
    \Civi::settings()->set(Builders::SETTING, ['nope', 'search_kit']);
    $this->assertSame(['search_kit'], Builders::takenOver());
  }

  public function testOwnRoutesShowTheirCoreRoute(): void {
    $this->assertSame('civicrm/admin/search', AdminPage::route('civicrm/admin/afreact/search'));
    $this->assertSame('civicrm/admin/afform', AdminPage::route('civicrm/admin/afreact/afform'));
    $this->assertSame('civicrm/search', AdminPage::route('civicrm/search'));
    $this->assertSame('search_kit', Builders::builderOf('civicrm/search'));
    $this->assertNull(Builders::builderOf('civicrm/admin'));
    $this->assertSame(
      explode('::', AdminPage::CALLBACK),
      \CRM_Core_Menu::get('civicrm/admin/afreact/search')['page_callback'],
    );
  }

  public function testBuilderPageDispatchesTheAssetsEvent(): void {
    unset(\Civi::$statics[Assets::class . '::dispatched:search_kit']);
    $seen = [];
    $listener = static function ($e) use (&$seen): void {
      $seen[] = $e->builder;
    };
    \Civi::dispatcher()->addListener('civi.afreact.assets', $listener);
    try {
      AdminPage::load('search_kit');
    }
    finally {
      \Civi::dispatcher()->removeListener('civi.afreact.assets', $listener);
    }
    $this->assertSame(['search_kit'], $seen);
  }

  public function testRuntimePagesDispatchTheAssetsEventOnce(): void {
    unset(\Civi::$statics[Assets::class . '::dispatched:search_kit']);
    $seen = [];
    $listener = static function ($e) use (&$seen): void {
      $seen[] = $e->builder;
    };
    \Civi::dispatcher()->addListener('civi.afreact.assets', $listener);
    try {
      Assets::load();
      Assets::load();
    }
    finally {
      \Civi::dispatcher()->removeListener('civi.afreact.assets', $listener);
    }
    $this->assertSame([''], $seen);
  }

  /**
   * @param list<mixed> $named
   * @param list<string> $replaces
   * @return mixed
   *   The panels the page hands the builder.
   */
  private function panelsAfter(string $builder, array $named, array $replaces = []): mixed {
    unset(\Civi::$statics[Assets::class . '::dispatched:search_kit']);
    $listener = static function ($e) use ($named, $replaces): void {
      foreach ($named as $name) {
        $e->panels[] = $name;
      }
      $e->replaces = $replaces;
    };
    \Civi::dispatcher()->addListener('civi.afreact.assets', $listener);
    try {
      Assets::load($builder);
    }
    finally {
      \Civi::dispatcher()->removeListener('civi.afreact.assets', $listener);
    }
    return \Civi::resources()->getSettings()['vars']['afreactAdmin']['panels'] ?? NULL;
  }

  public function testBuilderPageHandsOverTheNamedPanelsOnce(): void {
    $this->assertSame(
      ['afreact-probe-panel', 'afreact-probe-other'],
      $this->panelsAfter('search_kit', ['afreact-probe-panel', 'afreact-probe-other', 'afreact-probe-panel']),
    );
  }

  public function testRuntimePageLeavesPanelsOut(): void {
    $this->assertNotContains('afreact-probe-runtime', (array) $this->panelsAfter('', ['afreact-probe-runtime']));
  }

  public function testPanelThatIsNoCustomElementNameIsRefused(): void {
    $this->expectException(\CRM_Core_Exception::class);
    $this->expectExceptionMessage('A builder panel is not a custom element name');
    $this->panelsAfter('search_kit', ['Panel']);
  }

  public function testModuleAPluginsElementsReplaceIsNoIsland(): void {
    $module = static function ($e): void {
      $e->angularModules['afreactTestReplaced'] = [
        'ext' => 'afreact',
        'js' => [],
        'basePages' => ['civicrm/admin/search'],
      ];
    };
    \Civi::dispatcher()->addListener('hook_civicrm_angularModules', $module);
    Afforms::angular()->clear();
    try {
      $this->assertContains('afreactTestReplaced', ForeignModules::of('search_kit'));
      $this->panelsAfter('search_kit', [], ['afreactTestReplaced']);
      $this->assertNotContains('afreactTestReplaced', ForeignModules::of('search_kit'));
    }
    finally {
      \Civi::dispatcher()->removeListener('hook_civicrm_angularModules', $module);
      Afforms::angular()->clear();
    }
  }

  public function testForeignModulesFollowRequiresButNotIntoWhatAPluginReplaces(): void {
    $modules = static function (GenericHookEvent $e): void {
      $module = static fn (array $requires, array $basePages = []): array => [
        'ext' => E::LONG_NAME,
        'js' => [],
        'requires' => $requires,
        'basePages' => $basePages,
      ];
      $e->angularModules['afreactTestHost'] = $module(['afreactTestDependency'], ['civicrm/admin/search']);
      $e->angularModules['afreactTestDependency'] = $module([]);
      // As core adds the input types' admin modules to afGuiEditor's requires.
      $e->angularModules['afreactTestInjected'] = $module([]);
      $e->angularModules['crmSearchAdmin']['requires'][] = 'afreactTestInjected';
      $e->angularModules['afreactTestReplaced'] = $module(['afreactTestOnlyReplaced'], ['civicrm/admin/search']);
      $e->angularModules['afreactTestOnlyReplaced'] = $module([]);
    };
    \Civi::dispatcher()->addListener('hook_civicrm_angularModules', $modules);
    Afforms::angular()->clear();
    try {
      $this->panelsAfter('search_kit', [], ['afreactTestReplaced']);
      $this->assertSame(
        ['afreactTestDependency', 'afreactTestHost', 'afreactTestInjected'],
        ForeignModules::of('search_kit'),
      );
      // The support report lists the same, and what the plugins replace apart.
      $this->assertSame(ForeignModules::of('search_kit'), BuilderReport::check('search_kit')['modules']);
      $this->assertSame(['afreactTestReplaced'], BuilderReport::check('search_kit')['replaced']);
      // Each builder keeps its own: FormBuilder's plugins replace nothing here.
      $this->assertSame(['afreactTestReplaced'], BuilderPanels::replaced('search_kit'));
      $this->assertSame([], BuilderPanels::replaced('afform'));
    }
    finally {
      \Civi::dispatcher()->removeListener('hook_civicrm_angularModules', $modules);
      Afforms::angular()->clear();
    }
  }

}
