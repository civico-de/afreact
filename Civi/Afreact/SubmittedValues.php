<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Afform\Event\AfformBaseEvent;

/**
 * Afform.submit's values: entity => rows of `fields` and `joins`, read without trusting their shape.
 */
final readonly class SubmittedValues {

  /**
   * @param array<mixed> $values
   *   As the browser sent them, which its conditions read.
   * @param array<mixed> $saved
   *   As core saves them, with each entity's and join's `data` merged in.
   */
  public function __construct(
    private array $values,
    private array $saved,
  ) {}

  /**
   * @param array<mixed> $saved
   */
  public static function of(AfformBaseEvent $event, array $saved): self {
    $values = Record::array($event->getApiRequest()->getParams(), 'values');
    // The browser keeps extra fields as one row and sends them as `extra: {fields}`.
    $extra = Record::array($values, 'extra');
    $values['extra'] = array_key_exists('fields', $extra) ? [$extra] : $extra;
    return new self($values, $saved);
  }

  /**
   * @return array<mixed>
   *   The values as the browser sent them.
   */
  public function sent(): array {
    return $this->values;
  }

  /**
   * @return array<mixed>
   *   The values as core saves them, which core's own conditions read.
   */
  public function saved(): array {
    return $this->saved;
  }

  /**
   * The value of a field in one row as the browser sent it, '' when it sent none.
   */
  public function value(SubmittedRow $row, string $field): mixed {
    return self::read($this->values, $row, $field);
  }

  /**
   * @param array<mixed> $values
   */
  private static function read(array $values, SubmittedRow $row, string $field): mixed {
    $item = Record::array($values, $row->entity)[$row->index] ?? NULL;
    $values = $row->join === NULL
      ? Record::array($item, 'fields')
      : Record::array(Record::array($item, 'joins'), $row->join)[$row->joinIndex ?? 0] ?? NULL;
    return is_array($values) && array_key_exists($field, $values) ? $values[$field] : '';
  }

  /**
   * Whether the field holds a value in the row as saved, as core's getRequiredFieldError() asks.
   */
  public function filled(SubmittedRow $row, string $field): bool {
    return self::given(self::read($this->saved, $row, $field));
  }

  public static function given(mixed $value): bool {
    return (
      is_string($value)
      && $value !== ''
      || is_numeric($value)
      || is_bool($value)
      || is_array($value)
      && $value !== []
    );
  }

}
