<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * The support report lists the FormBuilder parts that bring their own admin template.
 *
 * @group headless
 */
class SupportPageHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return ck_headless()->install(['org.civicrm.afform_admin', 'civi_case'])->apply();
  }

  // deviation:behavior-get-full-select
  public function testListsBehaviorsWhileCiviCaseAddsItsModesToEachRow(): void {
    $behaviors = array_column(SupportPage::afform()['behaviors'], 'name');
    $this->assertContains('autofill', $behaviors);
  }

}
