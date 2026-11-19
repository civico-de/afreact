<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * JavaScript's Number() of a string, for RowOrder.
 */
final class JsNumber {

  private const SPACE = '[\s\p{Zs}\x{FEFF}\x{2028}\x{2029}]';

  private const DECIMAL = '/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i';

  public static function of(string $value): float {
    $text = preg_replace('/^' . self::SPACE . '+|' . self::SPACE . '+$/u', '', $value) ?? $value;
    return match (TRUE) {
      $text === '' => 0.0,
      preg_match(self::DECIMAL, $text) === 1 => floatval($text),
      preg_match('/^[+-]?Infinity$/', $text) === 1 => str_starts_with($text, '-') ? -INF : INF,
      preg_match('/^0x[0-9a-f]+$/i', $text) === 1 => (float) hexdec(substr($text, 2)),
      preg_match('/^0o[0-7]+$/i', $text) === 1 => (float) octdec(substr($text, 2)),
      preg_match('/^0b[01]+$/i', $text) === 1 => (float) bindec(substr($text, 2)),
      default => NAN,
    };
  }

}
