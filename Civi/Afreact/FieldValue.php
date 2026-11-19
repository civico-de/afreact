<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * Where a field's value lies: in its row, or for an extra field where fieldPlace() in
 * src/afform/model.ts keeps it, which core does not save.
 */
final readonly class FieldValue {

  /**
   * @param array<mixed>|null $extra
   *   An extra field's definition.
   */
  public function __construct(
    public string $name,
    public ?array $extra = NULL,
  ) {}

  /**
   * Whether the field holds a value in the row, as core's getRequiredFieldError() asks.
   */
  public function filledIn(SubmittedValues $submitted, SubmittedRow $row): bool {
    if ($this->extra === NULL) {
      return $submitted->filled($row, $this->name);
    }
    $sent = $submitted->sent();
    $extras = $row->keepsExtras()
      ? Record::array(Record::array($sent, $row->entity)[$row->index] ?? NULL, 'extras')
      : Record::array(Record::array($sent, 'extra')[0] ?? NULL, 'fields');
    return SubmittedValues::given($extras[$this->name] ?? NULL);
  }

}
