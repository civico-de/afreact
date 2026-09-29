<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * The two demo pages must differ only in the elements that mount the forms,
 * or the comparison measures page chrome instead of renderers.
 *
 * @group headless
 */
class PagesHeadlessTest extends TestCase implements HeadlessInterface {

  public function setUpHeadless(): CiviEnvBuilder {
    return ck_headless()->apply();
  }

  public function testDemoPagesDifferOnlyInTheirMountElements(): void {
    $react = Pages::reactWith('api');
    $angular = Pages::angular();
    $this->assertStringContainsString(
      '<afreact-form name="afformAfreactDemoContact" source="api"></afreact-form>',
      $react,
    );
    $this->assertStringContainsString(
      '<crm-angular-js modules="afformAfreactDemoContact afsearchAfreactDemoContacts">',
      $angular,
    );
    // Core's Afform page puts a form around the directive; React renders its own.
    $this->assertStringContainsString(
      '<form><afform-afreact-demo-contact></afform-afreact-demo-contact></form>',
      $angular,
    );

    $normalise = static fn (string $page): string => (
      preg_replace(
        [
          '#<crm-angular-js[^>]*>|</crm-angular-js>#',
          '#(<form>)?<(afreact-form|afform-[a-z-]+|afsearch-[a-z-]+)[^>]*></\2>(?(1)</form>)#',
          '#data-renderer="\w+"#',
          '#<h1[^>]*>.*?</h1>#s',
        ],
        ['', '<mount/>', '', ''],
        $page,
      ) ?? throw new \RuntimeException('preg_replace failed')
    );
    $this->assertStringContainsString(
      '<h2 id="afreact-demo-form">Contact form</h2><mount/></section>',
      $normalise($react),
    );
    $this->assertSame($normalise($react), $normalise($angular));
  }

  public function testDemoPageSetsTheLayoutSource(): void {
    $this->assertStringContainsString(
      '<afreact-form name="afsearchAfreactDemoContacts" source="bundle">',
      Pages::reactWith('bundle'),
    );
    $this->expectExceptionMessage('Unknown layout source "file".');
    Pages::reactWith('file');
  }

  public function testComparePageListsEveryVariant(): void {
    $this->assertSame(1, preg_match('#<afreact-compare pages="([^"]*)"></afreact-compare>#', Pages::compare(), $match));
    $pages = json_decode(html_entity_decode($match[1]), TRUE, 512, JSON_THROW_ON_ERROR);
    $this->assertIsArray($pages);
    $patterns = [
      '#civicrm/afreact/demo$#',
      '#civicrm/afreact/demo[?&]source=page$#',
      '#civicrm/afreact/demo[?&]source=bundle$#',
      '#civicrm/afreact/angular$#',
    ];
    $this->assertCount(count($patterns), $pages);
    foreach ($patterns as $index => $pattern) {
      $this->assertMatchesRegularExpression($pattern, $pages[$index]['url']);
    }
  }

}
