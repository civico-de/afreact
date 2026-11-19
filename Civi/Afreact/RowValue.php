<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * JavaScript's view of a JSON form value, for RowComparison.
 */
final class RowValue {

  /**
   * angular.equals(): numbers by value, anything else strictly, lists and objects item by item.
   */
  public static function equals(mixed $a, mixed $b): bool {
    $numbers = [self::number($a), self::number($b)];
    if (!in_array(NULL, $numbers, TRUE)) {
      return $numbers[0] === $numbers[1];
    }
    if (!is_array($a) || !is_array($b)) {
      return $a === $b;
    }
    if (array_is_list($a) !== array_is_list($b) || count($a) !== count($b)) {
      return FALSE;
    }
    foreach ($a as $key => $value) {
      if (!array_key_exists($key, $b) || !self::equals($value, $b[$key])) {
        return FALSE;
      }
    }
    return TRUE;
  }

  /**
   * Array.prototype.includes(): strict, with one number type.
   *
   * @param array<mixed> $list
   */
  public static function includes(array $list, mixed $value): bool {
    $number = self::number($value);
    return (
      in_array($value, $list, TRUE)
      || $number !== NULL
      && in_array($number, array_map(self::number(...), $list), TRUE)
    );
  }

  public static function lower(mixed $value): mixed {
    return is_string($value) ? mb_strtolower($value) : $value;
  }

  /**
   * No answer: unset, "", an empty list or object; FALSE and 0 are answers.
   */
  public static function isEmpty(mixed $value): bool {
    return $value === NULL || $value === '' || $value === [];
  }

  /**
   * The value as a float when JSON gave it as a number.
   */
  public static function number(mixed $value): ?float {
    return is_int($value) || is_float($value) ? (float) $value : NULL;
  }

}
