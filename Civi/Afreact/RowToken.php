<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * A value in an afreact condition such as `[Individual1.0.Email.@.email]`; `@` is the element's own row.
 */
final readonly class RowToken {

  private const PATTERN = '/^\[([A-Za-z0-9_]+)\.(\d+|@)\.([^\]]+)\]$/';

  /**
   * A join inside the token; custom field names hold dots but no index.
   */
  private const JOIN = '/^([A-Za-z0-9_]+)\.(\d+|@)\.(.+)$/';

  private function __construct(
    private string $entity,
    private string $index,
    private ?string $join,
    private string $joinIndex,
    private string $field,
  ) {}

  public static function parse(mixed $value): ?self {
    $match = [];
    if (!is_string($value) || preg_match(self::PATTERN, $value, $match) !== 1) {
      return NULL;
    }
    $join = [];
    if (preg_match(self::JOIN, $match[3], $join) !== 1) {
      return new self($match[1], $match[2], NULL, '', $match[3]);
    }
    return new self($match[1], $match[2], $join[1], $join[2], $join[3]);
  }

  /**
   * The submitted value the token names, read in the row the element sits in.
   */
  public function value(SubmittedValues $submitted, SubmittedRow $row): mixed {
    $ownEntity = $this->entity === $row->entity;
    $index = self::index($this->index, $ownEntity ? $row->index : NULL, $this->entity);
    if ($this->join === NULL) {
      return $submitted->value(new SubmittedRow($this->entity, (int) $index), $this->field);
    }
    $own = $ownEntity && $this->join === $row->join ? $row->joinIndex : NULL;
    $joinIndex = self::index($this->joinIndex, $own, $this->join);
    return $submitted->value(new SubmittedRow($this->entity, (int) $index, $this->join, $joinIndex), $this->field);
  }

  private static function index(string $index, int|string|null $own, string $name): int|string {
    if ($index !== '@') {
      return (int) $index;
    }
    return $own ?? throw new \CRM_Core_Exception("{$name}.@ outside a row of {$name}.");
  }

}
