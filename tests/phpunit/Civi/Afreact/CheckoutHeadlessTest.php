<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * What the page hands the checkout block for options with an Angular template: the modules
 * their islands load once chosen, from the afreactcheckout fixture.
 *
 * @group headless
 */
class CheckoutHeadlessTest extends TestCase implements HeadlessInterface {

  private const SETTING = 'contribute_enable_afform_contributions';

  public function setUpHeadless(): CiviEnvBuilder {
    // Riverlea's streams serve their own crmUI.css in place of core's.
    return ck_headless()
      ->install(['civi_contribute', 'riverlea', 'afreactcheckout'])
      ->callback(static fn () => \Civi::settings()->set('theme_backend', 'minetta'), 'afreact-theme')
      ->apply();
  }

  protected function setUp(): void {
    parent::setUp();
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = ['access CiviCRM'];
    \CRM_Core_Region::instance('html-header')->clear();
  }

  protected function tearDown(): void {
    \Civi::settings()->revert(self::SETTING);
    parent::tearDown();
  }

  public function testLoadLeavesCheckoutOutWhileAfformContributionsAreOff(): void {
    \Civi::settings()->set(self::SETTING, FALSE);
    Assets::load();
    $this->assertArrayNotHasKey('afCheckout', $this->vars());
  }

  public function testLoadNamesWhatEachTemplatedOptionsIslandLoads(): void {
    \Civi::settings()->set(self::SETTING, TRUE);
    Assets::load();
    $checkout = $this->vars()['afCheckout'];
    $this->assertArrayNotHasKey('template', $checkout['checkoutOptions']['pay_later']);
    $islands = $checkout['islands'];
    $this->assertSame(
      [
        'afreactcheckout_card' => ['label' => 'Demo card', 'module' => 'afreactCheckout'],
        'afreactcheckout_button' => ['label' => 'Demo wallet', 'module' => 'afreactCheckoutButton'],
        'afreactcheckout_widget' => ['label' => 'Demo widget', 'module' => 'afreactCheckout'],
      ],
      $islands['options'],
    );
    $this->assertSame(['afCore', 'afCheckout', 'afreactCheckout', 'afreactCheckoutButton'], $islands['modules']);

    $assets = $islands['assets'];
    $angular = $assets['settings']['angular'];
    foreach (['afCheckout', 'afreactCheckoutButton', 'crmResource', 'api4'] as $module) {
      $this->assertContains($module, $angular['modules']);
    }
    $this->assertSame(['afCheckout'], $angular['requires']['afreactCheckout']);
    $this->assertStringContainsString('an=angular-modules.json', $angular['bundleUrl']);
    $this->assertCount(1, $assets['scripts']);
    $this->assertStringContainsString('an=angular-modules.js&', $assets['scripts'][0]);
    // afCheckout's settings factory, which core's AngularLoader would give CRM.afCheckout.
    $this->assertArrayHasKey('afCheckout', $assets['settings']);
  }

  public function testIslandStylesheetsComeAsTheActiveThemeServesThem(): void {
    \Civi::settings()->set(self::SETTING, TRUE);
    Assets::load();
    $styles = $this->vars()['afCheckout']['islands']['assets']['styles'];
    $themes = \Civi::service('themes');
    $this->assertInstanceOf(\Civi\Core\Themes::class, $themes);
    $this->assertSame('minetta', $themes->getActiveThemeKey());
    $crmUi = $themes->resolveUrls('minetta', 'civicrm', 'ang/crmUI.css');
    $this->assertCount(1, $crmUi);
    $this->assertStringContainsString('/riverlea/', $crmUi[0]);
    $this->assertContains($crmUi[0], $styles);
    $this->assertSame(array_values(array_unique($styles)), $styles);
  }

  /**
   * @return array<string, mixed>
   */
  private function vars(): array {
    return \Civi::resources()->getSettings()['vars']['afreact'];
  }

}
