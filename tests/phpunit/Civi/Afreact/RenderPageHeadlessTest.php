<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\API\Exception\UnauthorizedException;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * Route civicrm/afreact/render: one form with the renderer the request names.
 *
 * @group headless
 */
class RenderPageHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return ck_headless()->apply();
  }

  protected function tearDown(): void {
    unset($_GET['name'], $_GET['renderer'], $_GET['options']);
    parent::tearDown();
  }

  public function testReactMountsTheCustomElement(): void {
    $page = RenderPage::renderWith('afformAfreactDemoContact', 'react');
    $this->assertStringContainsString(
      '<div id="bootstrap-theme" class="afreact-render" data-renderer="react">'
      . '<afreact-form name="afformAfreactDemoContact" source="page"></afreact-form></div>',
      $page,
    );
  }

  public function testAngularMountsTheDirectiveInAForm(): void {
    $page = RenderPage::renderWith('afformAfreactDemoContact', 'angular');
    $this->assertStringContainsString(
      '<crm-angular-js modules="afformAfreactDemoContact">'
      . '<div id="bootstrap-theme" class="afreact-render" data-renderer="angular">'
      . '<form><afform-afreact-demo-contact></afform-afreact-demo-contact></form></div></crm-angular-js>',
      $page,
    );
  }

  public function testOptionsReachBothRenderersAsAPlacementPassesThem(): void {
    $_GET['name'] = 'afformAfreactDemoContact';
    $_GET['options'] = '{}';
    $_GET['renderer'] = 'react';
    $this->assertStringContainsString(
      '<afreact-form name="afformAfreactDemoContact" source="page" options="{}"></afreact-form>',
      RenderPage::render(),
    );
    $_GET['renderer'] = 'angular';
    $_GET['options'] = '{"contact_id":5}';
    $this->assertStringContainsString(
      '<form><afform-afreact-demo-contact options="{&quot;contact_id&quot;:5}"></afform-afreact-demo-contact></form>',
      RenderPage::render(),
    );
  }

  public function testOptionsMustBeAJsonObject(): void {
    $_GET['name'] = 'afformAfreactDemoContact';
    $_GET['renderer'] = 'react';
    $_GET['options'] = '[5]';
    $this->expectExceptionMessage('The options parameter must be a JSON object.');
    RenderPage::render();
  }

  public function testFormPermissionDecidesAccess(): void {
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = [];
    $this->expectException(UnauthorizedException::class);
    $this->expectExceptionMessage('Form "afformAfreactDemoContact" does not exist or you may not open it.');
    RenderPage::renderWith('afformAfreactDemoContact', 'react');
  }

  public function testRequestMustNameAFormAndAKnownRenderer(): void {
    $_GET['name'] = 'afformAfreactDemoContact';
    $_GET['renderer'] = 'vue';
    $this->expectExceptionMessage('The page needs a form name and renderer=react or renderer=angular.');
    RenderPage::render();
  }

}
