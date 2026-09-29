<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Core\Event\GenericHookEvent;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * Forms in the afreact_forms setting go to the React renderer wherever core placed them.
 *
 * Not transactional: changing the setting rebuilds civicrm_menu by TRUNCATE, which commits.
 *
 * @group headless
 */
class TakeoverHeadlessTest extends TestCase implements HeadlessInterface {

  private const FORM = 'afformAfreactDemoContact';

  private const ROUTE = 'civicrm/afreact/demo-angular';

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  protected function setUp(): void {
    parent::setUp();
    \Civi::settings()->set(Takeover::SETTING, [self::FORM]);
  }

  protected function tearDown(): void {
    \Civi::settings()->set(Takeover::SETTING, []);
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = [];
    parent::tearDown();
  }

  public function testSettingOffersEveryFormButBlocks(): void {
    $options = Takeover::formOptions();
    $this->assertSame('Afreact demo contact (afformAfreactDemoContact)', $options[self::FORM]);
    $this->assertArrayHasKey('afsearchAfreactDemoContacts', $options);
    $this->assertArrayNotHasKey('afblockContactEmail', $options);
  }

  public function testListedFormPageRunsTheReactTemplateWithCoreTitleAndBreadcrumb(): void {
    $this->assertSame(FormPage::CALLBACK, \CRM_Core_Menu::get(self::ROUTE)['page_callback']);

    \CRM_Core_Config::singleton()->userPermissionClass->permissions = ['access CiviCRM'];
    $page = new \CRM_Core_Page('', \CRM_Core_Action::NONE);
    $page->urlPath = explode('/', self::ROUTE);
    $this->assertSame(self::FORM, FormPage::formName($page));
    $event = GenericHookEvent::create([
      'formName' => \CRM_Core_Page::class,
      'form' => $page,
      'context' => 'page',
      'tplName' => 'CRM/Core/Page.tpl',
    ]);
    \Civi::dispatcher()->dispatch('hook_civicrm_alterTemplateFile', $event);
    $this->assertSame(FormPage::TEMPLATE, $event->tplName);
    $this->assertSame(self::FORM, $page->getTemplateVars('afreactName'));

    \Civi::settings()->set(Takeover::SETTING, []);
    $this->assertSame('CRM_Afform_Page_AfformBase', \CRM_Core_Menu::get(self::ROUTE)['page_callback']);
    $this->assertNull(FormPage::formName($page));
  }

  public function testOtherPagesKeepTheirTemplate(): void {
    $page = new \CRM_Core_Page('', \CRM_Core_Action::NONE);
    $page->urlPath = ['civicrm', 'dashboard'];
    $this->assertNull(FormPage::formName($page));
    $item = ['page_callback' => 'CRM_Afform_Page_AfformBase', 'page_arguments' => 'afform=afformX'];
    $this->assertSame('afformX', FormPage::form($item, 'CRM_Afform_Page_AfformBase'));
    $this->assertNull(FormPage::form($item, FormPage::CALLBACK));
    $this->assertNull(FormPage::form(['page_arguments' => 'reset=1'] + $item, 'CRM_Afform_Page_AfformBase'));
  }

  public function testTabsCorePlacedForListedFormsIncludeTheReactTemplate(): void {
    $tabs = [
      ['id' => 'mine', 'template' => 'afform/InlineAfform.tpl', 'module' => self::FORM],
      ['id' => 'other', 'template' => 'afform/InlineAfform.tpl', 'module' => 'afformAfreactDemoRules'],
      ['id' => 'url', 'url' => 'civicrm/x'],
    ];
    \Civi::dispatcher()->dispatch('hook_civicrm_tabset', GenericHookEvent::create([
      'tabsetName' => 'civicrm/contact/view',
      'tabs' => &$tabs,
      'context' => ['caller' => 'test'],
    ]));
    $this->assertSame(Takeover::INLINE_TEMPLATE, $tabs[0]['template']);
    $this->assertSame(self::FORM, $tabs[0]['afreact']);
    $this->assertSame('afform/InlineAfform.tpl', $tabs[1]['template']);
    $this->assertArrayNotHasKey('afreact', $tabs[1]);
    $this->assertSame(['id' => 'url', 'url' => 'civicrm/x'], $tabs[2]);
  }

  public function testContactSummaryBlocksOfListedFormsGetTheReactMarkup(): void {
    $region = \CRM_Core_Region::instance('contact-basic-info-left');
    $region->add(['name' => 'afform:' . self::FORM, 'markup' => '<crm-angular-js/>']);
    $region->add(['name' => 'afform:afformAfreactDemoRules', 'markup' => '<crm-angular-js/>']);
    $page = new \CRM_Contact_Page_View_Summary();
    $page->set('cid', 5);
    try {
      \Civi::dispatcher()->dispatch('hook_civicrm_pageRun', GenericHookEvent::create(['page' => $page]));
      $this->assertSame(
        '<div class="crm-summary-block"><div id="bootstrap-theme"><afreact-form name="afformAfreactDemoContact" options="{&quot;contact_id&quot;:5}"></afreact-form></div></div>',
        preg_replace('#>\s+<#', '><', trim((string) $region->get('afform:' . self::FORM)['markup'])),
      );
      $this->assertSame('<crm-angular-js/>', $region->get('afform:afformAfreactDemoRules')['markup']);
    }
    finally {
      $region->clear();
    }
  }

  public function testContactLayoutBlocksOfListedFormsIncludeTheReactTemplate(): void {
    $blocks = [
      'afform' => [
        'blocks' => [
          self::FORM => ['tpl_file' => 'afform/InlineAfform.tpl', 'module' => self::FORM],
          'afformAfreactDemoRules' => ['tpl_file' => 'afform/InlineAfform.tpl'],
        ],
      ],
      'core' => ['blocks' => [self::FORM => ['tpl_file' => 'CRM/Contact/Page/Inline/Other.tpl']]],
    ];
    \Civi::dispatcher()->dispatch('hook_civicrm_contactSummaryBlocks', GenericHookEvent::create([
      'blocks' => &$blocks,
    ]));
    $this->assertSame(Takeover::INLINE_TEMPLATE, $blocks['afform']['blocks'][self::FORM]['tpl_file']);
    $this->assertSame(self::FORM, $blocks['afform']['blocks'][self::FORM]['afreact']);
    $this->assertSame('afform/InlineAfform.tpl', $blocks['afform']['blocks']['afformAfreactDemoRules']['tpl_file']);
    $this->assertSame('CRM/Contact/Page/Inline/Other.tpl', $blocks['core']['blocks'][self::FORM]['tpl_file']);
  }

  public function testSupportPageHandsTheListAndSettingsLinkToTheReport(): void {
    $this->assertMatchesRegularExpression(
      '#<afreact-support listed="\[&quot;afformAfreactDemoContact&quot;\]" settings="[^"]*civicrm/admin/setting/afreact(\?|&amp;)reset=1"></afreact-support>#',
      SupportPage::render(),
    );
  }

}
