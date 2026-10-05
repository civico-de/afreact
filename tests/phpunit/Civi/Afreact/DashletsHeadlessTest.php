<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Core\Event\GenericHookEvent;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use CRM_Afreact_ExtensionUtil as E;
use PHPUnit\Framework\TestCase;

/**
 * Dashlets of listed forms on core's Angular dashboard render with React.
 *
 * Not transactional: changing the setting rebuilds civicrm_menu by TRUNCATE, which commits.
 *
 * @group headless
 */
class DashletsHeadlessTest extends TestCase implements HeadlessInterface {

  private const LISTED = 'afsearchAfreactDemoDashletContacts';

  private const UNLISTED = 'afsearchAfreactDemoDashletContactTypes';

  private const LISTED_PARTIAL = '~/crmDashboard/directives/afsearch-afreact-demo-dashlet-contacts.html';

  private const UNLISTED_PARTIAL = '~/crmDashboard/directives/afsearch-afreact-demo-dashlet-contact-types.html';

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  /**
   * The extension's class loads with the headless environment, after PHPUnit reads constants.
   */
  private static function bundle(): string {
    return E::LONG_NAME . ':dist/afreact.js';
  }

  protected function setUp(): void {
    parent::setUp();
    // Afform declares a Dashboard record per dashlet form; a reused test database predates new forms.
    \CRM_Core_ManagedEntities::singleton()->reconcile();
    \Civi::settings()->set(Takeover::SETTING, [self::LISTED, 'afformAfreactDemoContact']);
    \CRM_Core_Region::instance('page-footer')->clear();
  }

  protected function tearDown(): void {
    \Civi::settings()->set(Takeover::SETTING, []);
    \CRM_Core_Region::instance('page-footer')->clear();
    parent::tearDown();
  }

  public function testListsOnlyListedFormsPlacedAsDashlets(): void {
    $this->assertSame(
      [self::LISTED => ['directive' => 'afsearch-afreact-demo-dashlet-contacts', 'module' => self::LISTED]],
      Dashlets::forms(),
    );
  }

  public function testListedDashletPartialHoldsTheReactElement(): void {
    $partials = Afforms::angular()->getPartials(Dashlets::MODULE);
    $this->assertSame('<afreact-form name="' . self::LISTED . '"></afreact-form>', $partials[self::LISTED_PARTIAL]);
    $this->assertSame(
      '<afsearch-afreact-demo-dashlet-contact-types></afsearch-afreact-demo-dashlet-contact-types>',
      $partials[self::UNLISTED_PARTIAL],
    );
    $this->assertStringContainsString('crm-dashlet-content', $partials['~/crmDashboard/Dashlet.html']);
  }

  public function testListedDashletModuleIsNotLoadedOnTheDashboard(): void {
    $modules = Afforms::angular()->resolveDependencies([Dashlets::MODULE]);
    $this->assertNotContains(self::LISTED, $modules);
    $this->assertContains(self::UNLISTED, $modules);
  }

  public function testUnlistingRestoresCoreDashlets(): void {
    \Civi::settings()->set(Takeover::SETTING, []);
    $angular = Afforms::angular();
    $this->assertSame(
      '<afsearch-afreact-demo-dashlet-contacts></afsearch-afreact-demo-dashlet-contacts>',
      $angular->getPartials(Dashlets::MODULE)[self::LISTED_PARTIAL],
    );
    $this->assertContains(self::LISTED, $angular->resolveDependencies([Dashlets::MODULE]));
  }

  public function testDashboardLoadsTheBundleOnlyWithAListedDashlet(): void {
    $run = static fn (\CRM_Core_Page $page) => \Civi::dispatcher()->dispatch(
      'hook_civicrm_pageRun',
      GenericHookEvent::create(['page' => $page]),
    );
    $run(new \CRM_Core_Page());
    $this->assertNull(\CRM_Core_Region::instance('page-footer')->get(self::bundle()));
    $run(new \CRM_Contact_Page_DashBoard());
    $this->assertNotNull(\CRM_Core_Region::instance('page-footer')->get(self::bundle()));

    \CRM_Core_Region::instance('page-footer')->clear();
    \Civi::settings()->set(Takeover::SETTING, ['afformAfreactDemoContact']);
    $run(new \CRM_Contact_Page_DashBoard());
    $this->assertNull(\CRM_Core_Region::instance('page-footer')->get(self::bundle()));
  }

}
