<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use CRM_Afreact_ExtensionUtil as E;

/**
 * The render page's choice of the records a placed form's placements would pass, so the form
 * shows as it does where it is placed.
 */
final class PlacementPicker {

  /**
   * The picker: one autocomplete per entity, submitted back to the render page at `$route`
   * (its URL, not HTML-encoded).
   *
   * @param array<string, string> $entities
   * @param array<string, int> $picked
   */
  public static function html(string $name, string $renderer, array $entities, array $picked, string $route): string {
    $fields = '';
    foreach ($entities as $key => $entity) {
      $id = Chrome::escape('afreact-placement-' . $key);
      $label = \Civi::entity($entity)->getMeta('title') ?? $entity;
      $fields .=
        '<label for="'
        . $id
        . '">'
        . Chrome::escape(is_string($label) ? $label : $entity)
        . '</label> '
        . '<input id="'
        . $id
        . '" name="placement_'
        . Chrome::escape($key)
        . '" class="crm-form-autocomplete"'
        . ' data-api-entity="'
        . Chrome::escape($entity)
        . '" value="'
        . ($picked[$key] ?? '')
        . '"> ';
    }
    // A GET form drops its action's query, so a route given as one travels as fields.
    [$path, $query] = explode('?', $route, 2) + [1 => ''];
    parse_str($query, $routeFields);
    $hidden = ['name' => $name, 'renderer' => $renderer] + array_filter($routeFields, is_string(...));
    $hiddenFields = '';
    foreach ($hidden as $field => $value) {
      $hiddenFields .=
        '<input type="hidden" name="' . Chrome::escape((string) $field) . '" value="' . Chrome::escape($value) . '">';
    }
    return (
      '<form method="get" action="'
      . Chrome::escape($path)
      . '" class="afreact-placement-picker crm-block">'
      . '<p>'
      . Chrome::escape(E::ts(
        'This form is placed where a record gives it its arguments. Choose one to show the form as it shows there.',
      ))
      . '</p>'
      . $hiddenFields
      . $fields
      . '<button type="submit" class="btn btn-primary">'
      . Chrome::escape(E::ts('Show'))
      . '</button>'
      . '</form>'
    );
  }

}
