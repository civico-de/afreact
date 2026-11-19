<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * Whether a decoded attribute is a condition list, as checkShape() in src/afform/rowConditions.ts
 * asks before the browser evaluates anything.
 */
final class RowConditionShape {

  /**
   * The attribute's condition list, NULL for anything that is not one.
   *
   * @return list<mixed>|null
   */
  public static function decode(string $attribute): ?array {
    $json = preg_replace('/^\((.*)\)$/s', '$1', trim($attribute)) ?? '';
    try {
      $conditions = json_decode($json, TRUE, 64, JSON_THROW_ON_ERROR);
    }
    catch (\JsonException) {
      return NULL;
    }
    return is_array($conditions) && array_is_list($conditions) && self::valid($conditions) ? $conditions : NULL;
  }

  /**
   * @param array<mixed> $expression
   */
  public static function valid(array $expression): bool {
    if (array_filter($expression, 'is_array') === $expression) {
      return self::all($expression);
    }
    [$head, $second] = $expression + [NULL, NULL];
    if (is_string($head) && in_array($head, ['AND', 'OR', 'NOT'], TRUE)) {
      return is_array($second) && array_filter($second, 'is_array') === $second && self::all($second);
    }
    return RowToken::parse($head) !== NULL && is_string($second);
  }

  /**
   * @param array<mixed> $clauses
   *   Lists only.
   */
  private static function all(array $clauses): bool {
    foreach ($clauses as $clause) {
      if (!is_array($clause) || !self::valid($clause)) {
        return FALSE;
      }
    }
    return TRUE;
  }

}
