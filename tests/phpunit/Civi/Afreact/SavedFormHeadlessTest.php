<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use Civi\Api4\Afreact;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * Layouts of forms saved during the test.
 *
 * Not transactional: Afform stores forms as files, and saving one can clear
 * civicrm_menu by TRUNCATE, which commits any open transaction.
 *
 * @group headless
 */
class SavedFormHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  protected function tearDown(): void {
    // Later transactional tests must not find the menu empty.
    \CRM_Core_Menu::store();
    parent::tearDown();
  }

  public function testSavingAFormRefreshesTheCachedLayout(): void {
    $save = static fn (string $text) => Afform::save(checkPermissions: FALSE)
      ->addRecord([
        'name' => 'afformAfreactCacheProbe',
        'type' => 'form',
        'title' => 'Probe',
        'layout' => "<p>{$text}</p>",
      ])
      ->setLayoutFormat('html')
      ->execute();
    $text = static fn (): string => json_encode(
      Afreact::getForm(checkPermissions: FALSE)->setName('afformAfreactCacheProbe')->execute()->single()['layout'],
      JSON_THROW_ON_ERROR,
    );
    try {
      $save('first');
      $this->assertStringContainsString('first', $text());
      $this->assertStringContainsString('first', $text());
      $save('second');
      $this->assertStringContainsString('second', $text());
    }
    finally {
      Afform::revert(checkPermissions: FALSE)->addWhere('name', '=', 'afformAfreactCacheProbe')->execute();
    }
  }

  public function testSavingABlockRefreshesTheLayoutsEmbeddingIt(): void {
    $saveBlock = static fn (string $text) => Afform::save(checkPermissions: FALSE)
      ->addRecord([
        'name' => 'afblockAfreactCacheProbe',
        'type' => 'block',
        'title' => 'Probe block',
        'layout' => "<p>{$text}</p>",
      ])
      ->setLayoutFormat('html')
      ->execute();
    $text = static fn (): string => json_encode(
      Afreact::getForm(checkPermissions: FALSE)->setName('afformAfreactCacheParent')->execute()->single()['layout'],
      JSON_THROW_ON_ERROR,
    );
    try {
      $saveBlock('first');
      Afform::save(checkPermissions: FALSE)
        ->addRecord([
          'name' => 'afformAfreactCacheParent',
          'type' => 'form',
          'title' => 'Parent',
          'layout' => '<div><afblock-afreact-cache-probe></afblock-afreact-cache-probe></div>',
        ])
        ->setLayoutFormat('html')
        ->execute();
      $this->assertStringContainsString('first', $text());
      $saveBlock('second');
      $this->assertStringContainsString('second', $text());
    }
    finally {
      Afform::revert(checkPermissions: FALSE)
        ->addWhere('name', 'IN', ['afformAfreactCacheParent', 'afblockAfreactCacheProbe'])
        ->execute();
    }
  }

  public function testSelfIncludingBlockIsRejected(): void {
    // Only the block: saving a form that embeds it crashes core before 6.19 (FormDataModel recursion).
    Afform::save(checkPermissions: FALSE)
      ->addRecord([
        'name' => 'afblockAfreactLoop',
        'type' => 'block',
        'title' => 'Loop',
        'layout' => '<div><afblock-afreact-loop></afblock-afreact-loop></div>',
      ])
      ->execute();
    try {
      $this->expectException(\CRM_Core_Exception::class);
      $this->expectExceptionMessage('Afform block afblockAfreactLoop includes itself.');
      Afreact::getForm(checkPermissions: FALSE)->setName('afblockAfreactLoop')->execute();
    }
    finally {
      // Afform stores saved forms as files, outside the test transaction.
      Afform::revert(checkPermissions: FALSE)->addWhere('name', '=', 'afblockAfreactLoop')->execute();
    }
  }

  public function testBundleOfASelfIncludingBlockNamesItOnce(): void {
    Afform::save(checkPermissions: FALSE)
      ->addRecord([
        'name' => 'afblockAfreactLoop',
        'type' => 'block',
        'title' => 'Loop',
        'permission' => ['access CiviCRM'],
        'layout' => '<div><afblock-afreact-loop></afblock-afreact-loop></div>',
      ])
      ->execute();
    try {
      \CRM_Core_Config::singleton()->userPermissionClass->permissions = ['access CiviCRM'];
      \CRM_Core_Region::instance('html-header')->clear();
      Assets::layouts('bundle', ['afblockAfreactLoop']);
      $bundle = \Civi::resources()->getSettings()['vars']['afreact']['bundle'] ?? NULL;
      $this->assertIsArray($bundle);
      $this->assertSame(['afblock-afreact-loop' => 'afblockAfreactLoop'], $bundle['blocks']);
      $this->assertSame(
        \Civi::service('asset_builder')->getUrl('angular-modules.json', ['modules' => 'afblockAfreactLoop']),
        $bundle['url'],
      );
    }
    finally {
      Afform::revert(checkPermissions: FALSE)->addWhere('name', '=', 'afblockAfreactLoop')->execute();
    }
  }

}
