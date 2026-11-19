<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * The submitted row a field sits in, whose indexes a condition's `@` stands for.
 */
final readonly class SubmittedRow {

  public function __construct(
    public string $entity,
    public int $index,
    public ?string $join = NULL,
    public int|string|null $joinIndex = NULL,
    public bool $slot = FALSE,
  ) {}

  /**
   * The entity and join an element's children edit; an empty entity outside any fieldset.
   *
   * @param array<mixed> $node
   */
  public function inside(array $node): self {
    $fieldset = Record::string($node, 'af-fieldset');
    if ($fieldset !== NULL) {
      return new self($fieldset, 0, slot: array_key_exists('af-repeat', $node));
    }
    $join = Record::string($node, 'af-join');
    return $join !== NULL && $this->entity !== '' ? new self($this->entity, 0, $join, slot: $this->slot) : $this;
  }

  /**
   * Whether an extra field here keeps its value in the item's `extras`, as fieldPlace() in
   * src/afform/model.ts places it: in a repeated fieldset, outside a repeated join.
   */
  public function keepsExtras(): bool {
    return $this->slot && ($this->join === NULL || $this->joinIndex !== NULL);
  }

  /**
   * Every saved row a field here edits: each row of its entity, and in a join the row of
   * its block, or every row of a repeating one.
   *
   * @return list<SubmittedRow>
   */
  public function rowsIn(SubmittedValues $submitted): array {
    if ($this->entity === '') {
      return [$this];
    }
    $rows = [];
    foreach (array_keys(Record::array($submitted->saved(), $this->entity)) as $index) {
      $item = Record::array($submitted->saved(), $this->entity)[$index];
      foreach ($this->joinRows($item) as $joinIndex) {
        $rows[] = new self($this->entity, (int) $index, $this->join, $joinIndex);
      }
    }
    return $rows;
  }

  /**
   * @return list<int|string|null>
   */
  private function joinRows(mixed $item): array {
    if ($this->join === NULL) {
      return [NULL];
    }
    $submitted = array_keys(Record::array(Record::array($item, 'joins'), $this->join));
    return $this->joinIndex === NULL ? $submitted : array_values(array_intersect($submitted, [$this->joinIndex]));
  }

}
