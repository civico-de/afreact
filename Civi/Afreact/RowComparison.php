<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * One clause of an afreact condition, compared as src/afform/conditions.ts compare() does in the
 * browser, so a rule shown as holding also holds on submit.
 */
final class RowComparison {

  public static function compare(mixed $left, string $operator, mixed $right): bool {
    $yes = $operator !== '!=' && !str_contains($operator, 'NOT ');
    return match ($operator) {
      '=', '!=', '==' => RowValue::equals(RowValue::lower($left), RowValue::lower($right)) === $yes,
      '>' => RowOrder::of($left, $right) > 0,
      '<' => RowOrder::of($left, $right) < 0,
      '>=' => RowOrder::of($left, $right) >= 0,
      '<=' => RowOrder::of($left, $right) <= 0,
      'IS EMPTY', 'IS NOT EMPTY' => RowValue::isEmpty($left) === $yes,
      'IS NULL', 'IS NOT NULL' => ($left === NULL) === $yes,
      'CONTAINS', 'NOT CONTAINS' => self::contains($left, $right) === $yes,
      'IN', 'NOT IN' => (
        is_array($right) && array_is_list($right) ? RowValue::includes($right, $left) : RowValue::equals($left, $right)
      ) === $yes,
      'BETWEEN', 'NOT BETWEEN' => self::between($left, $right, $yes),
      'LIKE', 'NOT LIKE' => self::like($left, $right) === $yes,
      default => throw new \CRM_Core_Exception("Unknown operator {$operator}."),
    };
  }

  private static function contains(mixed $left, mixed $right): bool {
    if (is_array($left) && array_is_list($left)) {
      return RowValue::includes($left, $right);
    }
    if (is_string($left) && is_string($right)) {
      return str_contains(mb_strtolower($left), mb_strtolower($right));
    }
    return RowValue::equals($left, $right);
  }

  private static function between(mixed $left, mixed $right, bool $yes): bool {
    if (!is_array($right) || !array_is_list($right) || count($right) !== 2) {
      return FALSE;
    }
    return (RowOrder::of($left, $right[0]) >= 0 && RowOrder::of($left, $right[1]) <= 0) === $yes;
  }

  private static function like(mixed $left, mixed $right): bool {
    if (!is_string($left) || !is_string($right)) {
      return RowValue::equals($left, $right);
    }
    $pattern = strtr(preg_quote($right, '/'), ['%' => '.*', '_' => '.']);
    return preg_match("/^{$pattern}$/iuD", $left) === 1;
  }

}
