<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use Civi\Api4\Afreact;
use Civi\Api4\WordReplacement;
use Civi\API\Exception\UnauthorizedException;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use Civi\Test\TransactionalInterface;
use PHPUnit\Framework\TestCase;

/**
 * Afreact.getForm against the demo forms shipped in ang/.
 *
 * @group headless
 */
class GetFormHeadlessTest extends TestCase implements HeadlessInterface, TransactionalInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return self::builder();
  }

  protected function tearDown(): void {
    // Saved forms are files, which the transaction does not roll back.
    Afform::revert(checkPermissions: FALSE)
      ->addWhere('name', 'IN', ['afformAfreactTestHost', 'afblockAfreactTestNote'])
      ->execute();
    parent::tearDown();
  }

  /**
   * afform_admin adds the gear menus getForm must strip. Angular module rebuilds look up
   * routes; a menu filled up front keeps that rebuild out of the test transactions.
   */
  public static function builder(): CiviEnvBuilder {
    return ck_headless()
      ->install(['org.civicrm.afform_admin', 'civicrm_admin_ui', 'chart_kit'])
      ->callback(static fn () => \Civi::router()->clear()->rebuild(), 'afreact-menu')
      ->apply();
  }

  public function testLayoutCarriesFieldMetadataAndInlinedBlocks(): void {
    $form = Afreact::getForm(checkPermissions: FALSE)->setName('afformAfreactDemoContact')->execute()->single();
    $this->assertSame('Afreact demo contact', $form['title']);
    $this->assertSame('form', $form['type']);

    $firstName = $this->findTag($form['layout'], 'af-field', 'first_name')[0];
    $this->assertSame('Text', $firstName['defn']['input_type']);
    $this->assertTrue($firstName['defn']['required']);
    $gender = $this->findTag($form['layout'], 'af-field', 'gender_id')[0];
    $this->assertNotEmpty($gender['defn']['options']);

    $block = $this->findTag($form['layout'], 'afblock-contact-email')[0];
    $this->assertCount(1, $this->findTag($block['#children'], 'af-field', 'email'));
    $this->assertSame([], $this->findTag($form['layout'], 'crm-admin-block-context-dropdown'));
    $this->assertStringNotContainsString('checkLinkPerm', json_encode($form['layout'], JSON_THROW_ON_ERROR));
  }

  public function testAutosaveDraftIsABooleanOnEveryForm(): void {
    $this->assertFalse($this->form('afformAfreactDemoContact')['autosave_draft']);
    Afform::create(checkPermissions: FALSE)
      ->setValues([
        'name' => 'afformAfreactTestHost',
        'type' => 'form',
        'title' => 'Host',
        'autosave_draft' => TRUE,
        'layout' => '<af-form ctrl="afform"></af-form>',
      ])
      ->execute();
    $this->assertTrue($this->form('afformAfreactTestHost')['autosave_draft']);
  }

  public function testMetaIsWhatAfformJsHandsTheAngularDirective(): void {
    Afform::create(checkPermissions: FALSE)
      ->setValues([
        'name' => 'afformAfreactTestHost',
        'type' => 'form',
        'title' => 'Host',
        'redirect' => 'civicrm/done',
        'autosave_draft' => TRUE,
        'confirmation_type' => 'show_confirmation_message',
        'confirmation_message' => '<p>Thanks</p>',
        'layout' => '<af-form ctrl="afform"></af-form>',
      ])
      ->execute();
    // Key order follows the API, as in afform.js.
    $this->assertEquals(
      [
        'name' => 'afformAfreactTestHost',
        'title' => 'Host',
        'redirect' => 'civicrm/done',
        'autosave_draft' => TRUE,
        'confirmation_type' => 'show_confirmation_message',
        'confirmation_message' => '<p>Thanks</p>',
      ],
      $this->form('afformAfreactTestHost')['meta'],
    );
  }

  public function testSearchDisplaySettingsArriveAsArray(): void {
    $form = Afreact::getForm(checkPermissions: FALSE)->setName('afsearchAfreactDemoContacts')->execute()->single();
    $display = $this->findTag($form['layout'], 'crm-search-display-table')[0];
    $this->assertSame('Afreact_Demo_Contacts', $display['search-name']);
    $this->assertIsArray($display['settings']);
    $this->assertSame(10, $display['settings']['limit']);
    $this->assertSame('sort_name', $display['settings']['columns'][0]['key']);
  }

  public function testStringsCarryTheTranslationsOfTheFormsTexts(): void {
    $this->assertSame([], $this->form('afformAfreactDemoContact')['strings']);

    WordReplacement::create(checkPermissions: FALSE)
      ->setValues(['find_word' => 'Learn more...', 'replace_word' => 'Read on', 'match_type' => 'exactMatch'])
      ->execute();
    // ts() keeps the replacements it read in a static.
    unset(\Civi::$statics[\CRM_Core_I18n::class]);
    $this->assertSame(['Learn more...' => 'Read on'], $this->form('afsearchManageACLs')['strings']);
  }

  public function testStringsIncludeTheTextsOfEmbeddedBlocks(): void {
    Afform::create(checkPermissions: FALSE)
      ->setValues([
        'name' => 'afblockAfreactTestNote',
        'type' => 'block',
        'title' => 'Note',
        'layout' => '<p>{{:: ts(\'Block probe\') }}</p>',
      ])
      ->execute();
    Afform::create(checkPermissions: FALSE)
      ->setValues([
        'name' => 'afformAfreactTestHost',
        'type' => 'form',
        'title' => 'Host',
        'layout' => '<af-form ctrl="afform"><afblock-afreact-test-note></afblock-afreact-test-note></af-form>',
      ])
      ->execute();
    WordReplacement::create(checkPermissions: FALSE)
      ->setValues(['find_word' => 'Block probe', 'replace_word' => 'Block replaced', 'match_type' => 'exactMatch'])
      ->execute();
    unset(\Civi::$statics[\CRM_Core_I18n::class]);
    $this->assertSame(['Block probe' => 'Block replaced'], $this->form('afformAfreactTestHost')['strings']);
  }

  public function testTsCallsInFieldDefinitionsAreTranslated(): void {
    Afform::create(checkPermissions: FALSE)
      ->setValues([
        'name' => 'afformAfreactTestHost',
        'type' => 'form',
        'title' => 'Host',
        'layout' =>
          '<af-form ctrl="afform"><af-entity type="Individual" name="Individual1" />'
            . '<fieldset af-fieldset="Individual1"><af-field name="first_name" '
            . 'defn="{help_pre: ts(\'Defn probe\'), input_attrs: {placeholder: ts(\'It\\\'s me\')}, '
            . 'label: \'ts(x)\'}" /></fieldset></af-form>',
      ])
      ->execute();
    WordReplacement::create(checkPermissions: FALSE)
      ->setValues(['find_word' => 'Defn probe', 'replace_word' => 'Defn replaced', 'match_type' => 'exactMatch'])
      ->execute();
    unset(\Civi::$statics[\CRM_Core_I18n::class]);
    $defn = $this->findTag($this->form('afformAfreactTestHost')['layout'], 'af-field', 'first_name')[0]['defn'];
    $this->assertSame('Defn replaced', $defn['help_pre']);
    $this->assertSame("It's me", $defn['input_attrs']['placeholder']);
    // A string literal stays as written.
    $this->assertSame('ts(x)', $defn['label']);
  }

  public function testFormPermissionDecidesAccess(): void {
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = ['access CiviCRM'];
    $this->assertSame(
      'afformAfreactDemoContact',
      Afreact::getForm()->setName('afformAfreactDemoContact')->execute()->single()['name'],
    );

    \CRM_Core_Config::singleton()->userPermissionClass->permissions = [];
    $this->expectException(UnauthorizedException::class);
    $this->expectExceptionMessage('Form "afformAfreactDemoContact" does not exist or you may not open it.');
    Afreact::getForm()->setName('afformAfreactDemoContact')->execute();
  }

  public function testUnknownFormIsRejected(): void {
    $this->expectException(UnauthorizedException::class);
    Afreact::getForm(checkPermissions: FALSE)->setName('afformDoesNotExist')->execute();
  }

  /**
   * @return array<string, mixed>
   */
  private function form(string $name): array {
    return Afreact::getForm(checkPermissions: FALSE)->setName($name)->execute()->single();
  }

  /**
   * @param list<array<string, mixed>> $nodes
   * @return list<array<string, mixed>>
   */
  private function findTag(array $nodes, string $tag, ?string $name = NULL): array {
    $found = [];
    foreach ($nodes as $node) {
      if (($node['#tag'] ?? NULL) === $tag && ($name === NULL || ($node['name'] ?? NULL) === $name)) {
        $found[] = $node;
      }
      $found = [...$found, ...$this->findTag($node['#children'] ?? [], $tag, $name)];
    }
    return $found;
  }

}
