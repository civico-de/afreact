<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * Afforms::cached() in core's Angular cache, across afreact versions.
 *
 * @group headless
 */
class AfformsCacheHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  protected function setUp(): void {
    parent::setUp();
    $this->cache()->clear();
  }

  public function testAValueIsBuiltOnceAndThenRead(): void {
    $this->assertSame('first', Afforms::cached('probe', static fn (): string => 'first'));
    $this->assertSame('first', Afforms::cached('probe', static fn (): string => 'second'));
  }

  public function testAnEntryAnOlderAfreactWroteIsNotRead(): void {
    // Up to 0.2.0 the key lacked the version, and its objects may not fit the current classes.
    $this->cache()->set('afreact_' . md5('probe_' . \CRM_Core_Resources::singleton()->getCacheCode()), 'older');
    $this->assertSame('built', Afforms::cached('probe', static fn (): string => 'built'));
  }

  private function cache(): \CRM_Utils_Cache_Interface {
    return \CRM_Utils_Cache::create([
      'scope' => 'version',
      'name' => 'angular',
      'type' => ['*memory*', 'SqlGroup', 'ArrayCache'],
      'withArray' => 'fast',
    ]);
  }

}
