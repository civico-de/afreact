<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use PHPUnit\Framework\TestCase;

/**
 * An extra field's value lies where fieldPlace() in src/afform/model.ts puts it.
 */
class FieldValueTest extends TestCase {

  public function testAnExtraFieldInARepeatedFieldsetIsKeptPerItem(): void {
    $values = new SubmittedValues([
      'Individual1' => [['extras' => []], ['extras' => ['code' => 'x']]],
      'extra' => [['fields' => ['code' => 'form']]],
    ], []);
    $code = new FieldValue('code', []);
    $this->assertTrue($code->filledIn($values, new SubmittedRow('Individual1', 1, slot: TRUE)));
    $this->assertFalse($code->filledIn($values, new SubmittedRow('Individual1', 0, slot: TRUE)));
    $this->assertTrue($code->filledIn($values, new SubmittedRow('Individual1', 0)));
    // A repeated join keeps one value for all its records, the form's.
    $this->assertTrue($code->filledIn($values, new SubmittedRow('Individual1', 0, 'Phone', NULL, TRUE)));
    // A join block of a repeated item keeps it in the item's extras.
    $this->assertFalse($code->filledIn($values, new SubmittedRow('Individual1', 0, 'Phone', 0, TRUE)));
  }

  public function testRowsInPreservesExtrasLocationForRepeatedFieldsetsAndJoins(): void {
    $saved = [
      'Individual1' => [
        ['fields' => [], 'joins' => ['Phone' => [['phone' => '111']]]],
        ['fields' => [], 'joins' => ['Phone' => [['phone' => '222']]]],
      ],
    ];
    $values = new SubmittedValues([
      'Individual1' => [['extras' => []], ['extras' => ['code' => 'x']]],
      'extra' => [['fields' => ['code' => 'form']]],
    ], $saved);
    $code = new FieldValue('code', []);

    $slotRows = (new SubmittedRow('Individual1', 0, slot: TRUE))->rowsIn($values);
    $this->assertCount(2, $slotRows);
    $this->assertFalse($code->filledIn($values, $slotRows[0]));
    $this->assertTrue($code->filledIn($values, $slotRows[1]));

    // A repeating join inside a repeated fieldset keeps extras at the form level, not per item.
    $joinRows = (new SubmittedRow('Individual1', 0, 'Phone', NULL, TRUE))->rowsIn($values);
    $this->assertCount(2, $joinRows);
    $this->assertTrue($code->filledIn($values, $joinRows[0]));
  }

}
