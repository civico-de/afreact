<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afreact;
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

  /**
   * afform_admin adds the gear menus getForm must strip. Angular module rebuilds look up
   * routes, and an empty menu is rebuilt by TRUNCATE, which would commit the test transaction.
   */
  public static function builder(): CiviEnvBuilder {
    return ck_headless()
      ->install(['org.civicrm.afform_admin'])
      ->callback([\CRM_Core_Menu::class, 'store'], 'afreact-menu')
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

  public function testSearchDisplaySettingsArriveAsArray(): void {
    $form = Afreact::getForm(checkPermissions: FALSE)->setName('afsearchAfreactDemoContacts')->execute()->single();
    $display = $this->findTag($form['layout'], 'crm-search-display-table')[0];
    $this->assertSame('Afreact_Demo_Contacts', $display['search-name']);
    $this->assertIsArray($display['settings']);
    $this->assertSame(10, $display['settings']['limit']);
    $this->assertSame('sort_name', $display['settings']['columns'][0]['key']);
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
