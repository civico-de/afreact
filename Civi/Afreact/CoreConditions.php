<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Afform\FormDataModel;
use Civi\Api4\Action\Afform\Submit;

/**
 * Core's af-if, af-required and af-disabled of one field, as FormDataModel decodes them.
 */
final readonly class CoreConditions {

  /**
   * @param array<mixed> $attributes
   * @param array<mixed> $submitted
   */
  private function __construct(
    private array $attributes,
    private array $submitted,
  ) {}

  /**
   * @param array<mixed> $submitted
   */
  public static function of(FormDataModel $model, RowConditionField $field, array $submitted): self {
    $entity = $model->getEntity($field->value->extra === NULL ? $field->at->entity : 'extra');
    $fields =
      $field->at->join === NULL || $field->value->extra !== NULL
        ? Record::array($entity, 'fields')
        : Record::array(Record::array(Record::array($entity, 'joins'), $field->at->join), 'fields');
    return new self(Record::array($fields, $field->value->name), $submitted);
  }

  /**
   * Whether core's required check leaves the field to itself: it requires the field and reports it,
   * or never checks its input type.
   *
   * @param array<mixed> $defn
   */
  public function exempts(array $defn): bool {
    return (
      in_array($defn['input_type'] ?? NULL, ['DisplayOnly', 'File'], TRUE)
      || !empty($defn['required'])
      || $this->holds('af-required', FALSE)
    );
  }

  /**
   * afField's isDisabled(): an af-disabled condition replaces the definition's own flag.
   *
   * @param array<mixed> $defn
   */
  public function disables(array $defn): bool {
    return Record::array($this->attributes, 'af-disabled') === []
      ? ($defn['disabled'] ?? NULL) === TRUE
      : $this->holds('af-disabled', FALSE);
  }

  /**
   * Whether every condition list of the attribute holds; `$none` without any.
   */
  private function holds(string $attribute, bool $none): bool {
    $lists = Record::array($this->attributes, $attribute);
    if ($lists === []) {
      return $none;
    }
    foreach ($lists as $conditions) {
      if (is_array($conditions) && !Submit::checkAfformConditional($conditions, $this->submitted)) {
        return FALSE;
      }
    }
    return TRUE;
  }

}
