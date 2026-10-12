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
    $this->assertSame(['modules' => [], 'partials' => [], 'replaced' => []], BuilderReport::check('search_kit'));
    \Civi::settings()->set(Builders::SETTING, ['search_kit']);
    Afforms::angular()->clear();
    $this->assertSame(['modules' => [], 'partials' => [], 'replaced' => []], BuilderReport::check('search_kit'));
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
        'replaced' => [],
      ],
      BuilderReport::check('search_kit'),
    );
    AdminPage::load('search_kit');
    $this->assertSame(
      ['~/crmChartKitAdmin/afreactAdded.html', '~/crmSearchAdmin/crmSearch-fields.html'],
      \Civi::resources()->getSettings()['vars']['afreactAdmin']['changedPartials'] ?? NULL,
    );
  }

  public function testPartialOnlyAChangeSetAPluginReplacesChangedIsNotReported(): void {
    $mark = static fn (string $name) => ChangeSet::create($name)
      ->alterHtml("~/crmSearchAdmin/crmSearch-{$name}.html", static function ($doc) use ($name): void {
        $doc->find('*')->eq(0)->attr('data-afreact-test', $name);
      });
    $this->listen('hook_civicrm_alterAngular', static function (GenericHookEvent $e) use ($mark): void {
      $e->angular->add($mark('fields'));
      $e->angular->add($mark('group'));
      // Another extension's change to the replaced partial still counts.
      $e->angular->add(ChangeSet::create(
        'other',
      )->alterHtml('~/crmSearchAdmin/crmSearch-group.html', static function ($doc): void {
        $doc->find('*')->eq(0)->attr('data-afreact-other', '1');
      }));
    });
    $this->listen('civi.afreact.assets', static function (GenericHookEvent $e): void {
      $e->replaces = ['fields', 'group'];
    });
    Afforms::angular()->clear();
    unset(\Civi::$statics[Assets::class . '::dispatched:search_kit']);
    AdminPage::load('search_kit');
    $this->assertSame(
      ['~/crmSearchAdmin/crmSearch-group.html'],
      \Civi::resources()->getSettings()['vars']['afreactAdmin']['changedPartials'] ?? NULL,
    );
    // The support report lists what blocks the React builder, and the plugins' replacements apart.
    $this->assertSame(['~/crmSearchAdmin/crmSearch-group.html'], BuilderReport::check('search_kit')['partials']);
    $this->assertSame(['fields', 'group'], BuilderReport::check('search_kit')['replaced']);
  }

  public function testBuilderModuleTheSiteLacksIsLeftOut(): void {
    $this->listen('hook_civicrm_angularModules', static function (GenericHookEvent $e): void {
      unset($e->angularModules['crmChartKitAdmin']);
    });
    Afforms::angular()->clear();
    $this->assertSame([], BuilderReport::partials('search_kit'));
  }

  public function testFormBuilderReportsForeignChangesButNotCoresOwn(): void {
    $this->assertSame(['modules' => [], 'partials' => [], 'replaced' => []], BuilderReport::check('afform'));
    // In the US core's own ChangeSet reorders the Location input type's units.
    $country = \Civi::settings()->get('defaultContactCountry');
    \Civi::settings()->set('defaultContactCountry', '1228');
    try {
      Afforms::angular()->clear();
      $this->assertSame([], BuilderReport::check('afform')['partials']);
      $this->listen('hook_civicrm_alterAngular', static function (GenericHookEvent $e): void {
        $e->angular->add(
          ChangeSet::create('afreactTestFormChange')
            ->alterHtml('~/afGuiEditor/inputType/Location.html', static function ($doc): void {
              $doc->find('*')->eq(0)->attr('data-afreact-test', '1');
            }),
        );
      });
      Afforms::angular()->clear();
      $this->assertSame(['~/afGuiEditor/inputType/Location.html'], BuilderReport::check('afform')['partials']);
    }
    finally {
      \Civi::settings()->set('defaultContactCountry', $country);
    }
  }

}
