<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afreact;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * What the page hands <afreact-form source="page|bundle">.
 *
 * @group headless
 */
class AssetsHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  protected function setUp(): void {
    parent::setUp();
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = ['access CiviCRM'];
    // Page settings live in this region and merge across calls.
    \CRM_Core_Region::instance('html-header')->clear();
  }

  public function testPageSourceEmbedsWhatGetFormReturns(): void {
    Assets::layouts('page', Pages::FORMS);
    $layouts = $this->vars()['layouts'];
    $this->assertSame(Pages::FORMS, array_keys($layouts));
    $this->assertSame(
      Afreact::getForm()->setName('afformAfreactDemoContact')->execute()->single(),
      $layouts['afformAfreactDemoContact'],
    );
  }

  public function testPageSourceLeavesOutFormsTheUserMayNotOpen(): void {
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = [];
    Assets::layouts('page', Pages::FORMS);
    $this->assertSame([], $this->vars()['layouts']);
  }

  public function testBundleSourceNamesTheModuleFileWithEmbeddedBlocks(): void {
    Assets::layouts('bundle', Pages::FORMS);
    $bundle = $this->vars()['bundle'];
    $this->assertSame(
      ['module' => 'afformAfreactDemoContact', 'title' => 'Afreact demo contact', 'type' => 'form'],
      $bundle['forms']['afformAfreactDemoContact'],
    );
    $this->assertSame(['afblock-contact-email' => 'afblockContactEmail'], $bundle['blocks']);
    $this->assertStringContainsString('angular-modules', $bundle['url']);
    $this->assertSame('js', $bundle['attributeTypes']['af-field']['defn']);
    $this->assertSame('text', $bundle['attributeTypes']['*']['*']);
  }

  public function testBundleSourceLeavesOutFormsTheUserMayNotOpen(): void {
    \CRM_Core_Config::singleton()->userPermissionClass->permissions = [];
    Assets::layouts('bundle', Pages::FORMS);
    $bundle = $this->vars()['bundle'];
    $this->assertSame([], $bundle['forms']);
    $this->assertNull($bundle['url']);
  }

  public function testUnknownSourceIsRejected(): void {
    $this->expectExceptionMessage('Unknown layout source "file".');
    Assets::layouts('file', Pages::FORMS);
  }

  /**
   * @return array<string, mixed>
   */
  private function vars(): array {
    $vars = \Civi::resources()->getSettings()['vars']['afreact'] ?? NULL;
    $this->assertIsArray($vars);
    return $vars;
  }

}
