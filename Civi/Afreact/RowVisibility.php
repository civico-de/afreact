<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Action\Afform\Submit;

/**
 * The af-if and afreact-if of one element and its ancestors: it shows while all of them hold.
 * Kept per element, since core's FormDataModel merges the af-if of every field of one name.
 */
final readonly class RowVisibility {

  /**
   * @param list<RowConditionList> $own
   * @param list<array<mixed>> $core
   *   Core's decoded condition lists.
   */
  public function __construct(
    public array $own = [],
    private array $core = [],
  ) {}

  /**
   * @param array<mixed> $node
   */
  public function inside(array $node): self {
    $own = Record::string($node, 'afreact-if');
    $core = self::decodeCore(Record::string($node, 'af-if'));
    return new self(
      $own === NULL ? $this->own : [...$this->own, RowConditionList::parse($own)],
      $core === NULL ? $this->core : [...$this->core, $core],
    );
  }

  /**
   * Core's af-if as FormDataModel::parseFields() decodes it; NULL without one or for one that fails.
   *
   * @return array<mixed>|null
   */
  private static function decodeCore(?string $attribute): ?array {
    $conditions = $attribute ? json_decode(html_entity_decode(substr($attribute, 1, -1))) : NULL;
    return is_array($conditions) ? $conditions : NULL;
  }

  public function shows(SubmittedValues $submitted, SubmittedRow $row): bool {
    foreach ($this->own as $if) {
      if (!$if->holds($submitted, $row)) {
        return FALSE;
      }
    }
    foreach ($this->core as $conditions) {
      if (!Submit::checkAfformConditional($conditions, $submitted->saved())) {
        return FALSE;
      }
    }
    return TRUE;
  }

}
