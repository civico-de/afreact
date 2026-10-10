<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * The build lists the bundle's ts() texts; the page gets the translations core has for them.
 *
 * @group headless
 */
class StringsHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  public function testTheBuildListsTheBundlesTexts(): void {
    $texts = Strings::texts();
    $this->assertContains('Open in the classic builder', $texts);
    $this->assertContains('Form "%1" does not exist or you may not open it.', $texts);
    $this->assertNotContains('', $texts);
  }

}
