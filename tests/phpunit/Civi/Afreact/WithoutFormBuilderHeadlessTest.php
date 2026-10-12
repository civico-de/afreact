<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * A site without FormBuilder's admin (afform_admin): only SearchKit's builder is offered or taken
 * over, and the support report's FormBuilder section is empty.
 *
 * @group headless
 */
class WithoutFormBuilderHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return ck_headless()->apply();
  }

  protected function tearDown(): void {
    \Civi::settings()->revert(Builders::SETTING);
    parent::tearDown();
  }

  public function testOnlySearchKitIsOfferedAndTakenOver(): void {
    $this->assertFalse(\CRM_Extension_System::singleton()->getMapper()->isActiveModule('afform_admin'));
    $this->assertSame(['search_kit'], Builders::available());
    $this->assertSame(['search_kit' => 'SearchKit'], Builders::options());
    \Civi::settings()->set(Builders::SETTING, ['search_kit', 'afform']);
    $this->assertSame(['search_kit'], Builders::takenOver());
  }

  public function testTheSupportReportHasNoFormBuilderFindings(): void {
    $this->assertNull(SupportPage::afform());
  }

}
