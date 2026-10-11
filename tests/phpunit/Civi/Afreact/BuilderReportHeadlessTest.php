<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Angular\ChangeSet;
use Civi\Core\Event\GenericHookEvent;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use CRM_Afreact_ExtensionUtil as E;
use PHPUnit\Framework\TestCase;

/**
 * @group headless
 */
class BuilderReportHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  /**
   * @var array<string, callable>
   */
  private array $listeners = [];

  protected function tearDown(): void {
    foreach ($this->listeners as $hook => $listener) {
      \Civi::dispatcher()->removeListener($hook, $listener);
    }
    Afforms::angular()->clear();
    \Civi::settings()->set(Builders::SETTING, []);
    parent::tearDown();
  }

  private function listen(string $hook, callable $listener): void {
    $this->listeners[$hook] = $listener;
    \Civi::dispatcher()->addListener($hook, $listener);
  }

  public function testCoreAloneLeavesNothingToReport(): void {
    $this->assertSame(['modules' => [], 'partials' => []], BuilderReport::check('search_kit'));
    \Civi::settings()->set(Builders::SETTING, ['search_kit']);
    Afforms::angular()->clear();
    $this->assertSame(['modules' => [], 'partials' => []], BuilderReport::check('search_kit'));
  }

  public function testReportsForeignModulesAndChangedPartialsButNotReencodedOnes(): void {
    $this->listen('hook_civicrm_angularModules', static function (GenericHookEvent $e): void {
      $e->angularModules['afreactTestDecorator'] = ['ext' => E::LONG_NAME, 'js' => [], 'basePages' => ['*']];
    });
    $this->listen('hook_civicrm_alterAngular', static function (GenericHookEvent $e): void {
      $e->angular->add(
        ChangeSet::create('afreactTestChange')
          ->alterHtml('~/crmSearchAdmin/crmSearch-fields.html', static function ($doc): void {
            $doc->find('*')->eq(0)->attr('data-afreact-test', '1');
          })
          // Matched but untouched: the ChangeSet only re-encodes it.
          ->alterHtml('~/crmSearchAdmin/crmSearch-group.html', static function (): void {}),
      );
    });
    $this->listen('hook_civicrm_buildAsset', static function (GenericHookEvent $e): void {
      if ($e->asset === 'angular-modules.json') {
        $json = json_decode($e->content, TRUE);
        $json['crmChartKitAdmin']['partials']['~/crmChartKitAdmin/afreactAdded.html'] = '<p></p>';
        $e->content = json_encode($json);
      }
    });
    Afforms::angular()->clear();
    $this->assertSame(
      [
        'modules' => ['afreactTestDecorator'],
        'partials' => ['~/crmChartKitAdmin/afreactAdded.html', '~/crmSearchAdmin/crmSearch-fields.html'],
      ],
      BuilderReport::check('search_kit'),
    );
  }

}
