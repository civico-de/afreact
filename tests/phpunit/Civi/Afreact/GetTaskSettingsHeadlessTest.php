<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afreact;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use Civi\Test\TransactionalInterface;
use PHPUnit\Framework\TestCase;

/**
 * Afreact.getTaskSettings: a listed module's settings factory, nothing else.
 *
 * @group headless
 */
class GetTaskSettingsHeadlessTest extends TestCase implements HeadlessInterface, TransactionalInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return ck_headless()->install(['message_admin'])->apply();
  }

  public function testRefusesAModuleOffTheList(): void {
    $this->expectExceptionMessage('No task settings for module "crmSearchTasks".');
    Afreact::getTaskSettings(checkPermissions: FALSE)->setModule('crmSearchTasks')->execute();
  }

  public function testReturnsTheTranslationTaskSettingsWhereCoreHasTheModule(): void {
    $call = Afreact::getTaskSettings(checkPermissions: FALSE)->setModule('crmMsgadmTasks');
    // Core ships the module on master only; an older core has no factory to run.
    if (!isset(Afforms::angular()->getModules()['crmMsgadmTasks'])) {
      $this->expectExceptionMessage('Module "crmMsgadmTasks" is not enabled.');
      $call->execute();
      return;
    }
    $settings = $call->execute()->single();
    $this->assertSame(\CRM_MessageAdmin_Settings::getTaskSettings(), $settings);
    $this->assertArrayHasKey('allLanguages', $settings);
    $this->assertArrayHasKey('uiLanguages', $settings);
  }

}
