<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\SearchDisplay;

/**
 * Runs one SearchDisplay as the renderer calls it, for CoreSamples.
 */
final class CoreDisplayRunner {

  /**
   * @param array<string, mixed> $node
   * @return array<string, mixed>
   */
  public static function run(array $node, string $form): array {
    $run = SearchDisplay::run(checkPermissions: FALSE)
      ->setSavedSearch($node['search-name'])
      ->setDisplay($node['display-name'])
      ->setAfform($form)
      ->setReturn('page:1');
    $decoded = \CRM_Utils_JS::decode(Record::string($node, 'filters') ?? '');
    if (is_array($decoded)) {
      $run->setFilters(array_filter($decoded, static fn (mixed $v): bool => $v !== NULL));
    }
    $result = $run->execute();
    $extras = [
      'toolbar' => $result->toolbar ?? NULL,
      'editable' => $result->editable ?? NULL,
      'labels' => $result->labels ?? NULL,
      'subsearch' => $result->subsearch ?? NULL,
    ];
    return (
      ['rows' => $result->getArrayCopy()] + array_filter($extras, static fn (mixed $extra): bool => $extra !== NULL)
    );
  }

}
