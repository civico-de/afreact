<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use Civi\Api4\Contact;
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
    return ck_headless()->install(['afreactdemo'])->apply();
  }

  private const PLACED = 'afformAfreactPlacedProbe';

  protected function tearDown(): void {
    unset($_GET['name'], $_GET['renderer'], $_GET['options'], $_GET['placement_contact_id']);
    Afform::revert(checkPermissions: FALSE)->addWhere('name', '=', self::PLACED)->execute();
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

  public function testAPlacedFormShowsForTheUsersOwnContactUntilAnotherIsPicked(): void {
    $own = $this->placedFormAndContact();
    \CRM_Core_Session::singleton()->set('userID', $own);
    $_GET['name'] = self::PLACED;
    $_GET['renderer'] = 'react';
    $page = RenderPage::render();
    $this->assertStringContainsString("options=\"{&quot;contact_id&quot;:{$own}}\"", $page);
    $this->assertStringContainsString(
      "name=\"placement_contact_id\" class=\"crm-form-autocomplete\" data-api-entity=\"Contact\" value=\"{$own}\"",
      $page,
    );
    $_GET['placement_contact_id'] = (string) ($own + 1);
    $_GET['renderer'] = 'angular';
    $this->assertStringContainsString('options="{&quot;contact_id&quot;:' . ($own + 1) . '}"', RenderPage::render());
  }

  public function testAClearedPickShowsThePlacedFormWithoutARecord(): void {
    $own = $this->placedFormAndContact();
    \CRM_Core_Session::singleton()->set('userID', $own);
    $_GET['name'] = self::PLACED;
    $_GET['renderer'] = 'react';
    $_GET['placement_contact_id'] = '';
    $page = RenderPage::render();
    $this->assertStringContainsString('<afreact-form name="' . self::PLACED . '" source="page"></afreact-form>', $page);
    $this->assertStringContainsString('data-api-entity="Contact" value=""', $page);
  }

  public function testThePickerSubmitsToTheRenderRoute(): void {
    $own = $this->placedFormAndContact();
    \CRM_Core_Session::singleton()->set('userID', $own);
    $_GET['name'] = self::PLACED;
    $_GET['renderer'] = 'react';
    $path = strtok(\CRM_Utils_System::url('civicrm/afreact/render', htmlize: FALSE), '?');
    $this->assertStringContainsString('<form method="get" action="' . $path . '"', RenderPage::render());
  }

  /**
   * @return array<string, array{mixed}>
   */
  public static function notRecordIds(): array {
    return ['a word' => ['x'], 'zero' => ['0'], 'a list' => [['5']]];
  }

  /**
   * @dataProvider notRecordIds
   */
  public function testAPickThatIsNoIdIsRefused(mixed $pick): void {
    \CRM_Core_Session::singleton()->set('userID', $this->placedFormAndContact());
    $_GET['name'] = self::PLACED;
    $_GET['renderer'] = 'react';
    $_GET['placement_contact_id'] = $pick;
    $this->expectExceptionMessage('placement_contact_id must be a record ID.');
    RenderPage::render();
  }

  public function testAContactBesideAnotherArgumentIsNotTheUsersOwn(): void {
    \CRM_Core_Session::singleton()->set('userID', $this->placedFormAndContact());
    $this->assertSame([], PlacementArguments::picked(['case_id' => 'Case', 'contact_id' => 'Contact']));
    $this->assertSame([], PlacementArguments::picked(['event_id' => 'Event']));
  }

  public function testThePickerCarriesARouteGivenAsAQuery(): void {
    $html = PlacementPicker::html(
      'probe',
      'react',
      ['contact_id' => 'Contact'],
      [],
      'https://example.org/wp-admin/admin.php?page=CiviCRM&q=civicrm/afreact/render',
    );
    $this->assertStringContainsString('<form method="get" action="https://example.org/wp-admin/admin.php"', $html);
    $this->assertStringContainsString(
      '<input type="hidden" name="name" value="probe">'
      . '<input type="hidden" name="renderer" value="react">'
      . '<input type="hidden" name="page" value="CiviCRM">'
      . '<input type="hidden" name="q" value="civicrm/afreact/render">',
      $html,
    );
  }

  public function testGivenOptionsLeaveNoPicker(): void {
    $this->placedFormAndContact();
    $_GET['name'] = self::PLACED;
    $_GET['renderer'] = 'react';
    $_GET['options'] = '{}';
    $this->assertStringNotContainsString('afreact-placement-picker', RenderPage::render());
  }

  private function placedFormAndContact(): int {
    Afform::save(checkPermissions: FALSE)
      ->addRecord([
        'name' => self::PLACED,
        'type' => 'search',
        'title' => 'Placed probe',
        'placement' => ['contact_summary_tab'],
        'layout' => '<p>probe</p>',
      ])
      ->setLayoutFormat('html')
      ->execute();
    return (int) Contact::create(checkPermissions: FALSE)
      ->setValues(['contact_type' => 'Organization', 'organization_name' => 'Probe'])
      ->execute()
      ->single()['id'];
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
