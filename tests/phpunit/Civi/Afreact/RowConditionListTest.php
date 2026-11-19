<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use PHPUnit\Framework\TestCase;

/**
 * RowConditionList decides as checkRowConditions() in src/afform/rowConditions.ts.
 */
class RowConditionListTest extends TestCase {

  private const VALUES = ['Individual1' => [['fields' => ['do_not_email' => TRUE]]]];

  public function testAGroupStopsAtTheClauseThatDecides(): void {
    $row = new SubmittedRow('Individual1', 0);
    $values = new SubmittedValues(self::VALUES, self::VALUES);
    // The second clause names a row the field is not in, which the browser never reaches.
    $or = '[["OR", [["[Individual1.0.do_not_email]", "=", true], ["[Individual1.0.Phone.@.phone]", "=", 2]]]]';
    $this->assertTrue(RowConditionList::parse($or)->holds($values, $row));
    $and = '[["[Individual1.0.do_not_email]", "=", false], ["[Individual1.0.Phone.@.phone]", "=", 2]]';
    $this->assertFalse(RowConditionList::parse($and)->holds($values, $row));
  }

  public function testAListThatIsNoConditionNeverHolds(): void {
    $row = new SubmittedRow('Individual1', 0);
    $values = new SubmittedValues(self::VALUES, self::VALUES);
    $this->assertFalse(RowConditionList::parse(
      '[["OR", [["[Individual1.0.do_not_email]", "=", true], "junk"]]]',
    )->holds($values, $row));
    $this->assertFalse(RowConditionList::parse('[["Individual1[0][fields][do_not_email]", "=", true]]')->holds(
      $values,
      $row,
    ));
    $this->assertTrue(RowConditionList::parse('[["[Individual1.0.do_not_email]", "=", true]]')->holds($values, $row));
  }

}
