<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * JavaScript's relational comparison of two JSON form values, for RowComparison.
 */
final class RowOrder {

  /**
   * Two strings compare as text, anything else as numbers; NAN when one side is no number, so
   * every comparison with it is false.
   */
  public static function of(mixed $left, mixed $right): float {
    $a = is_array($left) ? self::text($left) : $left;
    $b = is_array($right) ? self::text($right) : $right;
    if (is_string($a) && is_string($b)) {
      return (float) (strcmp($a, $b) <=> 0);
    }
    $x = self::number($a);
    $y = self::number($b);
    if (is_nan($x) || is_nan($y)) {
      return NAN;
    }
    return (float) ($x <=> $y);
  }

  /**
   * String() of a list joins its items; an object reads "[object Object]".
   *
   * @param array<mixed> $value
   */
  private static function text(array $value): string {
    if (!array_is_list($value)) {
      return '[object Object]';
    }
    return implode(',', array_map(static fn (mixed $item): string => is_scalar($item) ? (string) $item : '', $value));
  }

  /**
   * JavaScript's Number(): NULL and FALSE are 0, undefined and objects NAN.
   */
  private static function number(mixed $value): float {
    return (
      RowValue::number($value) ?? match (TRUE) {
        is_bool($value) => (float) $value,
        $value === NULL => 0.0,
        is_string($value) => JsNumber::of($value),
        default => NAN,
      }
    );
  }

}
