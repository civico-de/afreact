<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Afform\Event\AfformSubmitEvent;
use Civi\Core\Service\AutoSubscriber;

/**
 * afreact-disabled on submit (docs/adr/0012-own-condition-attributes.md): a field it disables in a row
 * is not saved there, as core's preprocessDisabledFields treats af-disabled.
 */
final class DisabledRowConditions extends AutoSubscriber {

  public static function getSubscribedEvents(): array {
    // Beside core's preprocessDisabledFields, before any record is saved.
    return ['civi.afform.submit' => ['onSubmit', 150]];
  }

  public static function onSubmit(AfformSubmitEvent $event): void {
    $entity = $event->getEntityName();
    $submitted = SubmittedValues::of($event, $event->getSubmittedValues());
    $records = $event->getRecords();
    foreach (RowConditionFields::of($event->getAfform()) as $field) {
      // Core saves no extra field, so there is nothing to keep out.
      if ($field->at->entity !== $entity || $field->disabled === NULL || $field->value->extra !== NULL) {
        continue;
      }
      foreach ($records as $index => $record) {
        $records[$index] = self::without(
          $field,
          $field->disabled,
          is_array($record) ? $record : [],
          (int) $index,
          $submitted,
        );
      }
    }
    $event->setRecords($records);
  }

  /**
   * The record without the field in the rows where it shows and its afreact-disabled holds.
   *
   * @param array<mixed> $record
   * @return array<mixed>
   */
  private static function without(
    RowConditionField $field,
    RowConditionList $disabled,
    array $record,
    int $index,
    SubmittedValues $submitted,
  ): array {
    $join = $field->at->join;
    if ($join === NULL) {
      $fields = Record::array($record, 'fields');
      $row = new SubmittedRow($field->at->entity, $index);
      // deviation:row-conditions
      if ($field->shows($submitted, $row) && $disabled->holds($submitted, $row)) {
        unset($fields[$field->value->name]);
      }
      return ['fields' => $fields] + $record;
    }
    $joins = Record::array($record, 'joins');
    $rows = Record::array($joins, $join);
    foreach ($rows as $joinIndex => $joinValues) {
      $row = new SubmittedRow($field->at->entity, $index, $join, $joinIndex);
      $other = $field->at->joinIndex !== NULL && $field->at->joinIndex !== $joinIndex;
      if ($other || !is_array($joinValues) || !$field->shows($submitted, $row) || !$disabled->holds($submitted, $row)) {
        continue;
      }
      unset($joinValues[$field->value->name]);
      $rows[$joinIndex] = $joinValues;
    }
    return ['joins' => [$join => $rows] + $joins] + $record;
  }

}
