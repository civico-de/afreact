<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use Civi\Api4\Navigation;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * Title and breadcrumb of a listed form's page, as CRM_Afform_Page_AfformBase::run() sets them.
 *
 * Not transactional: Afform stores forms as files, and saving one can clear
 * civicrm_menu by TRUNCATE, which commits any open transaction.
 *
 * @group headless
 */
class FormPageTitleHeadlessTest extends TestCase implements HeadlessInterface {

  private const FORM = 'afformAfreactTitleProbe';

  private const PARENT = 'afreact_title_probe_parent';

  /**
   * What the route's own breadcrumb left before the page ran.
   */
  private const ROUTE_CRUMB = ['title' => 'Route', 'url' => '/route'];

  private \CRM_Utils_System_Base $userSystem;

  /**
   * Records what the page hands the CMS, which the unit-test UF discards.
   */
  private object $spy;

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  protected function setUp(): void {
    parent::setUp();
    $config = \CRM_Core_Config::singleton();
    $this->userSystem = $config->userSystem;
    $this->spy = new class() extends \CRM_Utils_System_UnitTests {

      /**
       * @var list<array{title: string, url: string}>
       */
      public array $crumbs = [];

      public ?string $title = NULL;

      public function appendBreadCrumb($breadCrumbs) {
        array_push($this->crumbs, ...$breadCrumbs);
      }

      public function resetBreadCrumb() {
        $this->crumbs = [];
      }

      public function setTitle($title, $pageTitle = NULL) {
        $this->title = $title;
      }

    };
    $config->userSystem = $this->spy;
    Navigation::create(checkPermissions: FALSE)
      ->setValues(['name' => self::PARENT, 'label' => 'Probe parent', 'url' => 'civicrm/admin/afreact-probe?reset=1'])
      ->execute();
  }

  protected function tearDown(): void {
    \CRM_Core_Config::singleton()->userSystem = $this->userSystem;
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = [];
    Afform::revert(checkPermissions: FALSE)->addWhere('name', '=', self::FORM)->execute();
    Navigation::delete(checkPermissions: FALSE)->addWhere('name', '=', self::PARENT)->execute();
    // Later transactional tests must not find the menu empty.
    \CRM_Core_Menu::store();
    parent::tearDown();
  }

  public function testAFormInTheMenuTakesTheMenusBreadcrumbForStaff(): void {
    $this->save(public: FALSE);
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = ['access CiviCRM'];
    $this->spy->crumbs = [self::ROUTE_CRUMB];
    FormPageTitle::apply($this->page(), self::FORM);
    $this->assertSame(
      [
        ['title' => 'CiviCRM', 'url' => (string) \Civi::url('current://civicrm', 'h')],
        ['title' => 'Probe parent', 'url' => (string) \Civi::url('current://civicrm/admin/afreact-probe?reset=1', 'h')],
        ['title' => 'Probe title', 'url' => \CRM_Utils_System::url('civicrm/afreact-probe') . '#'],
      ],
      $this->spy->crumbs,
    );
    $this->assertSame('Probe title', $this->spy->title);
  }

  public function testOthersGetOnlyTheFormsOwnCrumb(): void {
    $this->save(public: FALSE);
    // A NULL list would grant every permission.
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = [];
    $this->spy->crumbs = [self::ROUTE_CRUMB];
    FormPageTitle::apply($this->page(), self::FORM);
    $this->assertSame(
      [
        self::ROUTE_CRUMB,
        ['title' => 'Probe title', 'url' => \CRM_Utils_System::url('civicrm/afreact-probe') . '#'],
      ],
      $this->spy->crumbs,
    );
  }

  public function testAPublicFormGetsATitleAndNoBreadcrumb(): void {
    $this->save(public: TRUE);
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = ['access CiviCRM'];
    FormPageTitle::apply($this->page(), self::FORM);
    $this->assertSame([], $this->spy->crumbs);
    $this->assertSame('Probe title', $this->spy->title);
  }

  private function save(bool $public): void {
    Afform::save(checkPermissions: FALSE)
      ->addRecord([
        'name' => self::FORM,
        'type' => 'form',
        'title' => '<em>Probe</em> title',
        'is_public' => $public,
        'permission' => [\CRM_Core_Permission::ALWAYS_ALLOW_PERMISSION],
        'navigation' => ['parent' => self::PARENT, 'label' => 'Probe', 'weight' => 0],
        'layout' => '<p>probe</p>',
      ])
      ->setLayoutFormat('html')
      ->execute();
  }

  private function page(): \CRM_Core_Page {
    $page = new \CRM_Core_Page('', \CRM_Core_Action::NONE);
    $page->urlPath = ['civicrm', 'afreact-probe'];
    return $page;
  }

}
