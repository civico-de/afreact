<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\SearchDisplay;

/**
 * A search display element in a compiled form layout.
 */
final class EmbeddedDisplay {

  /**
   * @param array<mixed> $node
   * @return array<mixed>
   */
  public static function prepare(array $node): array {
    // Afform injects display settings as a JS literal the client cannot parse.
    if (isset($node['settings']) && is_string($node['settings'])) {
      $node['settings'] = \CRM_Utils_JS::decode($node['settings']);
      $node['display-label'] = self::label($node['search-name'] ?? NULL, $node['display-name'] ?? NULL);
    }
    return $node;
  }

  /**
   * The label of an embedded display, which names its table or list. deviation:form-display-named
   */
  private static function label(mixed $search, mixed $display): string {
    if (!is_string($search) || $search === '') {
      return '';
    }
    $found = is_string($display) && $display !== ''
      ? SearchDisplay::get(FALSE)
        ->addSelect('label')
        ->addWhere('name', '=', $display)
        ->addWhere('saved_search_id.name', '=', $search)
        ->execute()
        ->first()
      : SearchDisplay::getDefault(FALSE)->setSavedSearch($search)->addSelect('label')->execute()->first();
    $label = is_array($found) ? $found['label'] ?? NULL : NULL;
    return is_string($label) ? $label : '';
  }

}
