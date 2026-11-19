<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use PHPUnit\Framework\TestCase;

/**
 * RowComparison answers as compare() in src/afform/conditions.ts, so browser and submit agree.
 */
class RowComparisonTest extends TestCase {

  /**
   * @return array<string, array{mixed, string, mixed, bool}>
   */
  public static function clauses(): array {
    return [
      'a number and its text differ, as in JavaScript' => [2, '=', '2', FALSE],
      'an integer and a float are one number' => [2, '=', 2.0, TRUE],
      'text compares without case' => ['Ada', '=', 'ada', TRUE],
      'not equal' => ['a', '!=', 'b', TRUE],
      'lists compare item by item' => [[1, 2], '=', [1, 2], TRUE],
      'two strings order as text' => ['10', '<', '9', TRUE],
      'a number and a string order as numbers' => [10, '>', '9', TRUE],
      'no number never orders' => ['x', '>', 1, FALSE],
      'false is an answer' => [FALSE, 'IS EMPTY', NULL, FALSE],
      'an empty list is none' => [[], 'IS EMPTY', NULL, TRUE],
      'the empty string is not null' => ['', 'IS NULL', NULL, FALSE],
      'a list contains an item' => [[1, 2], 'CONTAINS', 2, TRUE],
      'text contains without case' => ['Hello', 'CONTAINS', 'ELL', TRUE],
      'in a list' => [2, 'IN', [1, 2], TRUE],
      'in a list by type' => ['2', 'NOT IN', [1, 2], TRUE],
      'between its bounds' => [5, 'BETWEEN', [1, 9], TRUE],
      'between without a pair' => [5, 'NOT BETWEEN', [1], FALSE],
      'like with wildcards' => ['Hello', 'LIKE', 'h_l%', TRUE],
      'like keeps an asterisk as text' => ['Hello', 'LIKE', 'H*', FALSE],
      'like ends at the end, not before a final newline' => ["yes\n", 'LIKE', 'yes', FALSE],
      'hexadecimal text is a number' => ['0x10', '>', 10, TRUE],
      'a no-break space around a number is space' => ["\u{00A0}5\u{00A0}", '>=', 5, TRUE],
      'Infinity is a number' => ['Infinity', '>', 1, TRUE],
      'a missing value orders as no number' => [5, '>=', Undefined::Value, FALSE],
      'a missing value equals nothing' => [NULL, '=', Undefined::Value, FALSE],
      'a missing value differs from everything' => ['a', '!=', Undefined::Value, TRUE],
    ];
  }

  /**
   * @dataProvider clauses
   */
  public function testAClauseAnswersAsInTheBrowser(mixed $left, string $operator, mixed $right, bool $expected): void {
    $this->assertSame($expected, RowComparison::compare($left, $operator, $right));
  }

  public function testAnUnknownOperatorIsAnError(): void {
    $this->expectException(\CRM_Core_Exception::class);
    RowComparison::compare(1, '~', 1);
  }

}
