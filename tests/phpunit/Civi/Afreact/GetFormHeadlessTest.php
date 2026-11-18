<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use Civi\Api4\Afreact;
use Civi\Api4\SearchDisplay;
use Civi\Api4\WordReplacement;
use Civi\API\Exception\UnauthorizedException;
use Civi\Core\Event\GenericHookEvent;
use Civi\Core\Locale;
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
   * afform_admin adds the gear menus getForm passes on, afreactdemo the demo forms. Angular
   * module rebuilds look up routes; a menu filled up front keeps that rebuild out of the test
   * transactions.
   */
  public static function builder(): CiviEnvBuilder {
    return ck_headless()
      ->install(['org.civicrm.afform_admin', 'civicrm_admin_ui', 'chart_kit', 'afreactdemo'])
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
    // afform_admin's edit menu, which the renderer shows after its own permission check.
    $elements = array_values(array_filter($form['layout'], static fn (array $node) => isset($node['#tag'])));
    $menu = end($elements);
    $this->assertSame('btn-group crm-admin-block-context-dropdown dropup', $menu['class'] ?? NULL);
    $this->assertMatchesRegularExpression(
      "/^checkLinkPerm\\('manage own afform', (null|\\d+)\\)$/",
      $menu['ng-if'] ?? '',
    );
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

  /**
   * deviation:form-display-named
   */
  public function testAnEmbeddedDisplayCarriesItsLabel(): void {
    $display = $this->findTag($this->form('afsearchAfreactDemoContacts')['layout'], 'crm-search-display-table')[0];
    $label = SearchDisplay::get(FALSE)
      ->addSelect('label')
      ->addWhere('name', '=', $display['display-name'])
      ->addWhere('saved_search_id.name', '=', $display['search-name'])
      ->execute()
      ->single()['label'];
    $this->assertNotSame('', $label);
    $this->assertSame($label, $display['display-label']);
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

  /**
   * deviation:form-strings-extension-domain
   */
  public function testAFormsStringsAreTranslatedInItsExtensionsDomain(): void {
    // A locale object skips negotiation, which needs core's language files for German.
    \CRM_Core_I18n::singleton()->setLocale(new Locale(['nominal' => 'de_DE', 'ts' => 'de_DE']));
    try {
      $form = $this->form('afformAfreactDemoContact');
    }
    finally {
      \CRM_Core_I18n::singleton()->setLocale('en_US');
    }
    $repeat = array_values(array_filter(
      $this->findTag($form['layout'], 'div'),
      fn (array $node): bool => isset($node['af-repeat']),
    ));
    $this->assertSame('E-Mail hinzufügen', $repeat[0]['af-repeat'] ?? NULL);
    $this->assertSame('Kontakt gespeichert.', $form['meta']['confirmation_message']);
  }

  /**
   * deviation:form-strings-extension-domain
   */
  public function testACoreFormKeepsCoresDomainWhenAnExtensionShipsTheSameName(): void {
    $dir = sys_get_temp_dir() . '/afreact-domain-' . uniqid();
    mkdir($dir);
    file_put_contents("{$dir}/afformQuickAddIndividual.aff.html", '<div></div>');
    $listener = static function (GenericHookEvent $event) use ($dir): void {
      $event->paths[] = ['weight' => 0, 'path' => $dir, 'module' => 'org.example.probe'];
    };
    \Civi::dispatcher()->addListener('civi.afform.searchPaths', $listener);
    try {
      \Civi::service('afform_scanner')->clear();
      $this->assertSame(
        ['civicrm', 'org.example.probe'],
        array_keys(\Civi::service('afform_scanner')->findFilePaths()['afformQuickAddIndividual']),
      );
      $this->assertNull(Afforms::domain('afformQuickAddIndividual'));
      $this->assertSame(['afreactdemo', NULL], Afforms::domain('afformAfreactDemoContact'));
    }
    finally {
      \Civi::dispatcher()->removeListener('civi.afform.searchPaths', $listener);
      \Civi::service('afform_scanner')->clear();
      unlink("{$dir}/afformQuickAddIndividual.aff.html");
      rmdir($dir);
    }
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
