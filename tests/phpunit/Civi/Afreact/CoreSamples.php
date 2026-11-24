<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use Civi\Api4\Afreact;

require_once __DIR__ . '/CoreDisplayRunner.php';

/**
 * Samples what core sends the renderer for every form the installed extensions ship: field
 * metadata, display settings and the SearchDisplay.run result of each display.
 */
final class CoreSamples {

  private CoreShape $shape;

  /**
   * @var list<string>
   */
  private array $failed = [];

  public function __construct() {
    $this->shape = new CoreShape(
      literals: ['input_type', 'data_type', 'columns[].type'],
      maps: ['operators', 'rows[].data', 'editable', 'subsearch'],
    );
    $forms = Afform::get(checkPermissions: FALSE)->addSelect('name', 'has_local')->addOrderBy('name')->execute();
    // Local forms and local edits differ between a dev site and CI; extensions ship the rest.
    foreach (array_filter((array) $forms, static fn (array $form): bool => !$form['has_local']) as $form) {
      try {
        $this->walk(
          Afreact::getForm(checkPermissions: FALSE)->setName($form['name'])->execute()->single()['layout'],
          $form['name'],
        );
      }
      catch (\Throwable $e) {
        $this->failed[] = "{$form['name']}: {$e->getMessage()}";
      }
    }
  }

  public function shape(): CoreShape {
    return $this->shape;
  }

  /**
   * Forms and displays that did not load.
   *
   * @return list<string>
   */
  public function failed(): array {
    return $this->failed;
  }

  /**
   * @param list<array<string, mixed>> $nodes
   *   Layout nodes as Afreact.getForm returns them; text and comment nodes have no #tag.
   */
  private function walk(array $nodes, string $form): void {
    foreach ($nodes as $node) {
      if (!isset($node['#tag'])) {
        continue;
      }
      $this->addElement($node);
      if (str_starts_with($node['#tag'], 'crm-search-display-')) {
        $this->addDisplay($node, $form);
      }
      $this->walk($node['#children'] ?? [], $form);
    }
  }

  /**
   * @param array<string, mixed> $node
   */
  private function addElement(array $node): void {
    $tag = $node['#tag'];
    if (!str_contains($tag, '-')) {
      $this->shape->addLiteral('HtmlTag', $tag);
      return;
    }
    $attributes = array_filter(
      array_keys($node),
      static fn (int|string $key): bool => !str_starts_with((string) $key, '#'),
    );
    foreach ($attributes as $attribute) {
      $this->shape->addLiteral('DirectiveAttribute', "{$tag} {$attribute}");
    }
    if ($tag === 'af-field' && isset($node['defn'])) {
      $this->shape->add('FieldDefn', $node['defn']);
    }
  }

  /**
   * @param array<string, mixed> $node
   */
  private function addDisplay(array $node, string $form): void {
    $type = ucfirst(substr($node['#tag'], strlen('crm-search-display-')));
    $this->shape->add("{$type}Settings", $node['settings']);
    try {
      $this->shape->add("{$type}Run", CoreDisplayRunner::run($node, $form));
    }
    catch (\Throwable $e) {
      $this->failed[] = "{$form} {$node['search-name']}.{$node['display-name']}: {$e->getMessage()}";
    }
  }

}
