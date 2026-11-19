<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * An afreact-if, afreact-required or afreact-disabled value (docs/adr/0012-own-condition-attributes.md):
 * core's condition list over RowTokens, evaluated as the browser evaluates it (RowComparison).
 * A list that does not parse or evaluate never holds, as in the browser.
 */
final readonly class RowConditionList {

  /**
   * @param list<mixed>|null $conditions
   *   NULL for an attribute that does not parse.
   */
  private function __construct(
    private ?array $conditions,
  ) {}

  public static function parse(string $attribute): self {
    return new self(RowConditionShape::decode($attribute));
  }

  public function holds(SubmittedValues $submitted, SubmittedRow $row): bool {
    if ($this->conditions === NULL) {
      return FALSE;
    }
    try {
      return self::check($this->conditions, $submitted, $row);
    }
    catch (\CRM_Core_Exception) {
      return FALSE;
    }
  }

  /**
   * @param array<mixed> $expression
   */
  private static function check(array $expression, SubmittedValues $submitted, SubmittedRow $row): bool {
    // An empty list is an empty AND, as in the browser.
    if (array_filter($expression, 'is_array') === $expression) {
      return self::group('AND', $expression, $submitted, $row);
    }
    [$head, $operator, $value] = $expression + [NULL, NULL, Undefined::Value];
    if (is_string($head) && in_array($head, ['AND', 'OR', 'NOT'], TRUE)) {
      return self::group($head, is_array($operator) ? $operator : [], $submitted, $row);
    }
    $token = RowToken::parse($head);
    if ($token === NULL || !is_string($operator)) {
      throw new \CRM_Core_Exception('A clause starts with a token and names an operator.');
    }
    $compared = RowToken::parse($value);
    $expected = $compared === NULL ? $value : $compared->value($submitted, $row);
    return RowComparison::compare($token->value($submitted, $row), $operator, $expected);
  }

  /**
   * @param array<mixed> $clauses
   */
  private static function group(
    string $conjunction,
    array $clauses,
    SubmittedValues $submitted,
    SubmittedRow $row,
  ): bool {
    // Stops at the first clause that decides, as some() and every() do in the browser.
    $decides = $conjunction !== 'AND';
    foreach ($clauses as $clause) {
      if ((is_array($clause) && self::check($clause, $submitted, $row)) === $decides) {
        return $conjunction === 'OR';
      }
    }
    return $conjunction !== 'OR';
  }

}
