<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * Writes the shapes CoreShape inferred as TypeScript, sorted so that a change in core shows as a
 * small diff. A key missing from some samples is optional.
 */
final class TypeScriptShape {

  private const SCALARS = ['boolean', 'number', 'string', 'null'];

  public static function file(string $header, CoreShape $shape): string {
    $out = [$header, ''];
    $unions = $shape->unions();
    ksort($unions);
    foreach ($unions as $type => $values) {
      sort($values);
      $out[] = "export type {$type} =\n  | " . implode("\n  | ", array_map(self::literal(...), $values)) . ";\n";
    }
    $roots = $shape->roots();
    ksort($roots);
    foreach ($roots as $type => $root) {
      $out[] = "export type {$type} = " . self::type($root, '') . ";\n";
    }
    return implode("\n", $out);
  }

  /**
   * @param array<string, mixed> $shape
   */
  private static function type(array $shape, string $indent): string {
    $parts = array_map(self::literal(...), array_map('strval', array_keys($shape['literal'] ?? [])));
    sort($parts);
    $parts = [...$parts, ...array_values(array_intersect(self::SCALARS, array_keys($shape['scalar'] ?? [])))];
    if (isset($shape['list'])) {
      $item = self::type($shape['list'], $indent);
      $parts[] = str_contains($item, ' | ') ? "({$item})[]" : "{$item}[]";
    }
    if (isset($shape['map'])) {
      $parts[] = 'Record<string, ' . self::type($shape['map'], $indent) . '>';
    }
    if (isset($shape['object'])) {
      $parts[] = self::object($shape['object'], $indent);
    }
    return $parts === [] ? 'never' : implode(' | ', $parts);
  }

  /**
   * @param array{count: int, keys: array<string, array{count: int, shape: array<string, mixed>}>} $object
   */
  private static function object(array $object, string $indent): string {
    $keys = $object['keys'];
    ksort($keys, SORT_STRING);
    $lines = ['{'];
    foreach ($keys as $key => $entry) {
      $name = preg_match('/^[A-Za-z_$][\w$]*$/', (string) $key) === 1 ? $key : self::literal((string) $key);
      $optional = $entry['count'] < $object['count'] ? '?' : '';
      $lines[] = "{$indent}  {$name}{$optional}: " . self::type($entry['shape'], "{$indent}  ") . ';';
    }
    $lines[] = "{$indent}}";
    return implode("\n", $lines);
  }

  private static function literal(string $value): string {
    return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
  }

}
