<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
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

  protected function tearDown(): void {
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

  public function testUnknownBuildersAreIgnored(): void {
    \Civi::settings()->set(Builders::SETTING, ['nope', 'search_kit']);
    $this->assertSame(['search_kit'], Builders::builders());
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

}
