<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * Infers the shape of sample values: keys, how often each key is present, and the value types.
 * Listed paths keep their strings as literals; mapped paths have data as keys (Record<string, …>).
 */
final class CoreShape {

  /**
   * @var array<string, array<string, mixed>>
   *   type name => shape
   */
  private array $roots = [];

  /**
   * @var array<string, array<string, true>>
   *   type name => literals
   */
  private array $unions = [];

  /**
   * @param list<string> $literals
   *   Paths whose strings are kept as literal types, e.g. "columns[].type".
   * @param list<string> $maps
   *   Paths whose keys are data, e.g. "rows[].data".
   */
  public function __construct(
    private readonly array $literals = [],
    private readonly array $maps = [],
  ) {}

  public function add(string $type, mixed $value): void {
    $this->roots[$type] = $this->merge($this->roots[$type] ?? [], $value, '');
  }

  /**
   * A union of string literals, e.g. the tags core's forms use.
   */
  public function addLiteral(string $type, string $value): void {
    $this->unions[$type][$value] = TRUE;
  }

  /**
   * @return array<string, array<string, mixed>>
   */
  public function roots(): array {
    return $this->roots;
  }

  /**
   * @return array<string, list<string>>
   */
  public function unions(): array {
    return array_map(static fn (array $values): array => array_map('strval', array_keys($values)), $this->unions);
  }

  /**
   * @param array<string, mixed> $shape
   * @return array<string, mixed>
   */
  private function merge(array $shape, mixed $value, string $path): array {
    if (!is_array($value)) {
      return $this->mergeScalar($shape, $value, $path);
    }
    if (in_array($path, $this->maps, TRUE)) {
      $shape['map'] = $this->mergeItems($shape['map'] ?? [], $value, "{$path}{}");
      return $shape;
    }
    if (array_is_list($value)) {
      $shape['list'] = $this->mergeItems($shape['list'] ?? [], $value, "{$path}[]");
      return $shape;
    }
    $shape['object'] = $this->mergeObject($shape['object'] ?? ['count' => 0, 'keys' => []], $value, $path);
    return $shape;
  }

  /**
   * @param array<string, mixed> $shape
   * @param array<mixed> $items
   * @return array<string, mixed>
   */
  private function mergeItems(array $shape, array $items, string $path): array {
    foreach ($items as $item) {
      $shape = $this->merge($shape, $item, $path);
    }
    return $shape;
  }

  /**
   * @param array{count: int, keys: array<string, array{count: int, shape: array<string, mixed>}>} $object
   * @param array<mixed> $value
   * @return array{count: int, keys: array<string, array{count: int, shape: array<string, mixed>}>}
   */
  private function mergeObject(array $object, array $value, string $path): array {
    $object['count']++;
    foreach ($value as $key => $item) {
      $key = (string) $key;
      $known = $object['keys'][$key] ?? ['count' => 0, 'shape' => []];
      $object['keys'][$key] = [
        'count' => $known['count'] + 1,
        'shape' => $this->merge($known['shape'], $item, $path === '' ? $key : "{$path}.{$key}"),
      ];
    }
    return $object;
  }

  /**
   * @param array<string, mixed> $shape
   * @return array<string, mixed>
   */
  private function mergeScalar(array $shape, mixed $value, string $path): array {
    if (is_string($value) && in_array($path, $this->literals, TRUE)) {
      $shape['literal'][$value] = TRUE;
      return $shape;
    }
    $scalar = match (TRUE) {
      $value === NULL => 'null',
      is_bool($value) => 'boolean',
      is_int($value), is_float($value) => 'number',
      is_string($value) => 'string',
      default => throw new \UnexpectedValueException(
        'No shape for a value of type ' . get_debug_type($value) . " at {$path}",
      ),
    };
    $shape['scalar'][$scalar] = TRUE;
    return $shape;
  }

}
