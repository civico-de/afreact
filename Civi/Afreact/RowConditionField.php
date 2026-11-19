<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * An af-field with afreact's own conditions, or under an element whose afreact-if can hide it.
 */
final readonly class RowConditionField {

  /**
   * @param \Civi\Afreact\SubmittedRow $at
   *   The entity and join the field edits.
   * @param \Civi\Afreact\RowVisibility $visibility
   *   Its own af-if and afreact-if and those of its ancestors.
   * @param \Civi\Afreact\FieldValue $value
   *   For an extra field apart from `$at`, whose row its conditions read.
   */
  public function __construct(
    public SubmittedRow $at,
    public FieldValue $value,
    public RowVisibility $visibility,
    public ?RowConditionList $required,
    public ?RowConditionList $disabled,
  ) {}

  /**
   * @param array<mixed> $node
   *   An af-field.
   */
  public static function fromNode(array $node, SubmittedRow $at, RowVisibility $visibility): ?self {
    $extra = Record::string($node, 'name') === NULL ? Record::array($node, 'defn') : NULL;
    $name = Record::string($extra ?? $node, 'name');
    $required = Record::string($node, 'afreact-required');
    $disabled = Record::string($node, 'afreact-disabled');
    if (
      $name === NULL
      || $at->entity === ''
      && $extra === NULL
      || $visibility->own === []
      && $required === NULL
      && $disabled === NULL
    ) {
      return NULL;
    }
    $value = new FieldValue($name, $extra);
    return new self($at, $value, $visibility, self::conditions($required), self::conditions($disabled));
  }

  private static function conditions(?string $attribute): ?RowConditionList {
    return $attribute === NULL ? NULL : RowConditionList::parse($attribute);
  }

  /**
   * Whether afreact-required requires the field in the row, where it shows, is enabled and empty.
   *
   * @param array<mixed> $defn
   */
  public function missingIn(SubmittedValues $submitted, SubmittedRow $row, CoreConditions $core, array $defn): bool {
    if (
      $this->required === NULL
      || $this->value->filledIn($submitted, $row)
      || !$this->required->holds($submitted, $row)
    ) {
      return FALSE;
    }
    $disabled = $core->disables($defn) || ($this->disabled?->holds($submitted, $row) ?? FALSE);
    return !$disabled && $this->shows($submitted, $row);
  }

  public function shows(SubmittedValues $submitted, SubmittedRow $row): bool {
    return $this->visibility->shows($submitted, $row);
  }

}
