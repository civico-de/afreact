<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;

/**
 * The af-fields of a form that afreact's own conditions apply to, embedded blocks included.
 */
final class RowConditionFields {

  /**
   * @param array<string, string> $blocks
   *   Block directive name => Angular module name.
   */
  private function __construct(
    private readonly array $blocks,
  ) {}

  /**
   * Blocks of each non-repeating join seen so far, per entity: block n edits join row n.
   *
   * @var array<string, int>
   */
  private array $offsets = [];

  /**
   * @param array<mixed> $afform
   *   The form as Afform.submit loaded it, its layout in array format.
   * @return list<RowConditionField>
   */
  public static function of(array $afform): array {
    return Afforms::cached(
      'row_conditions_' . Afforms::field($afform, 'name'),
      static fn (): array => (new self(Afforms::blocks()))->walk(
        Record::array($afform, 'layout'),
        new SubmittedRow('', 0),
        new RowVisibility(),
      ),
    );
  }

  /**
   * @param array<mixed> $nodes
   * @param \Civi\Afreact\SubmittedRow $at
   *   The entity and join the nodes edit; an empty entity outside any fieldset.
   * @param \Civi\Afreact\RowVisibility $visibility
   * @param list<string> $trail
   *   Blocks already being walked, to stop recursive blocks.
   * @return list<RowConditionField>
   */
  private function walk(array $nodes, SubmittedRow $at, RowVisibility $visibility, array $trail = []): array {
    $fields = [];
    foreach ($nodes as $node) {
      $tag = Record::string($node, '#tag');
      if ($tag === NULL || !is_array($node)) {
        continue;
      }
      $nodeIfs = $visibility->inside($node);
      if ($tag === 'af-field') {
        $field = RowConditionField::fromNode($node, $at, $nodeIfs);
        $fields = $field === NULL ? $fields : [...$fields, $field];
        continue;
      }
      $children = $this->joinRow($node, $at->inside($node));
      $fields = [...$fields, ...$this->walk(Record::array($node, '#children'), $children, $nodeIfs, $trail)];
      $block = in_array($tag, $trail, TRUE) ? NULL : $this->blockLayout($tag);
      if ($block !== NULL) {
        $fields = [...$fields, ...$this->walk($block, $children, $nodeIfs, [...$trail, $tag])];
      }
    }
    return $fields;
  }

  /**
   * A non-repeating af-join edits its own row, as joinOffsets() in src/afform/structure.ts counts.
   *
   * @param array<mixed> $node
   */
  private function joinRow(array $node, SubmittedRow $inside): SubmittedRow {
    if ($inside->join === NULL || Record::string($node, 'af-join') === NULL || array_key_exists('af-repeat', $node)) {
      return $inside;
    }
    $key = $inside->entity . '.' . $inside->join;
    $offset = $this->offsets[$key] ?? 0;
    $this->offsets[$key] = $offset + 1;
    return new SubmittedRow($inside->entity, 0, $inside->join, $offset, $inside->slot);
  }

  /**
   * @return array<mixed>|null
   */
  private function blockLayout(string $tag): ?array {
    $module = $this->blocks[$tag] ?? NULL;
    if ($module === NULL) {
      return NULL;
    }
    $block = Afform::get(checkPermissions: FALSE)
      ->addWhere('module_name', '=', $module)
      ->addSelect('layout')
      ->execute()
      ->first();
    return Record::array($block, 'layout');
  }

}
