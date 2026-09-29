<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * The attribute types core's CRM_Afform_ArrayHtml decodes partials with, including those
 * AfformBehavior extensions add, so the browser can parse partials the same way.
 */
final class AttributeSchema extends \CRM_Afform_ArrayHtml {

  /**
   * @return array<string, array<string, string>>
   *   Tag ('*' for every tag) => attribute ('*' for every attribute) => 'text' or 'js'.
   */
  public function attributeTypes(): array {
    $result = [];
    foreach ($this->getSchema() as $tag => $attributes) {
      foreach ((array) $attributes as $attribute => $type) {
        if (!is_string($type) || str_starts_with((string) $attribute, '#')) {
          continue;
        }
        $result[(string) $tag][(string) $attribute] = $type;
      }
    }
    return $result;
  }

}
