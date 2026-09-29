<?php

/**
 * Counts what the site's Afforms use once compiled: elements, attributes, expressions, field
 * input types and search display settings, each with the number of forms using it (npm run inventory).
 */

declare(strict_types = 1);

/**
 * @var array<string, array<string, array<string, true>>> $counts
 *   kind => key => forms using it
 */
$counts = [];
$count = static function (string $kind, string $key, string $form) use (&$counts): void {
  $counts[$kind][$key][$form] = TRUE;
};

$countText = static function (string $text, string $form) use ($count): void {
  preg_match_all('/\{\{(.*?)\}\}/s', $text, $expressions);
  foreach ($expressions[1] as $expression) {
    $count('expression', trim($expression), $form);
  }
};

$countAttributes = static function (array $node, string $form) use ($count): void {
  foreach ($node as $attribute => $value) {
    if (!is_string($attribute) || $attribute[0] === '#') {
      continue;
    }
    $count('attribute', $attribute, $form);
    $text = is_string($value) ? $value : (string) json_encode($value);
    if (preg_match('/^(ng-(?!href)|af-if|af-required|af-disabled)/', $attribute) === 1 || str_contains($text, '{{')) {
      $count('expression', "{$attribute}=\"{$text}\"", $form);
    }
  }
};

$countDisplay = static function (array $settings, string $form) use ($count): void {
  foreach (array_keys($settings) as $setting) {
    $count('display_setting', (string) $setting, $form);
  }
  foreach (is_array($settings['columns'] ?? NULL) ? $settings['columns'] : [] as $column) {
    $count('display_column', is_array($column) ? (string) ($column['type'] ?? '?') : '?', $form);
    foreach (is_array($column) ? array_keys($column) : [] as $key) {
      $count('display_column_key', (string) $key, $form);
    }
  }
};

$walk = static function (array $nodes, string $form) use (
  &$walk,
  $count,
  $countText,
  $countAttributes,
  $countDisplay,
): void {
  foreach ($nodes as $node) {
    if (is_array($node) && is_string($node['#text'] ?? NULL)) {
      $countText($node['#text'], $form);
    }
    if (!is_array($node) || !is_string($node['#tag'] ?? NULL)) {
      continue;
    }
    $count('element', $node['#tag'], $form);
    $countAttributes($node, $form);
    if (is_string($node['defn']['input_type'] ?? NULL)) {
      $count('input_type', $node['defn']['input_type'], $form);
    }
    if (str_starts_with($node['#tag'], 'crm-search-display-') && is_array($node['settings'] ?? NULL)) {
      $countDisplay($node['settings'], $form);
    }
    $walk(is_array($node['#children'] ?? NULL) ? $node['#children'] : [], $form);
  }
};

$forms = civicrm_api4('Afform', 'get', ['select' => ['name', 'type'], 'orderBy' => ['name' => 'ASC']]);
$failed = [];
foreach ($forms as $form) {
  try {
    $layout = civicrm_api4('Afreact', 'getForm', ['name' => $form['name']])->first()['layout'] ?? [];
    $count('type', (string) $form['type'], $form['name']);
    $walk($layout, $form['name']);
  }
  catch (\Throwable $e) {
    $failed[] = "{$form['name']}: " . $e->getMessage();
  }
}

echo 'Forms: ' . count($forms) . ', compiled: ' . (count($forms) - count($failed)) . "\n";
foreach ($failed as $line) {
  echo "  failed {$line}\n";
}
ksort($counts);
foreach ($counts as $kind => $keys) {
  uasort($keys, static fn (array $a, array $b): int => count($b) <=> count($a));
  echo "\n{$kind} (forms using it)\n";
  foreach ($keys as $key => $usedBy) {
    printf("  %4d  %s\n", count($usedBy), $key);
  }
}
