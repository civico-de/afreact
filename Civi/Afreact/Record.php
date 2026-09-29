<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * Typed reads from the untyped arrays hooks and APIv4 hand over.
 */
final class Record {

  public static function string(mixed $record, string $key): ?string {
    $value = is_array($record) ? $record[$key] ?? NULL : NULL;
    return is_string($value) ? $value : NULL;
  }

  /**
   * @return array<mixed>
   */
  public static function array(mixed $record, string $key): array {
    $value = is_array($record) ? $record[$key] ?? NULL : NULL;
    return is_array($value) ? $value : [];
  }

}
