<?php

declare(strict_types = 1);

namespace Civi\AfreactIsland;

use Civi\Afform\AbstractBehavior;

/**
 * A behavior with its own settings template, for households only.
 *
 * @service afreactisland.island_greeting
 */
class IslandGreeting extends AbstractBehavior {

  /**
   * @return list<string>
   */
  public static function getEntities(): array {
    return ['Household'];
  }

  public static function getTitle(): string {
    return 'Island greeting';
  }

  /**
   * @return list<array{name: string, label: string}>
   */
  public static function getModes(string $entityName): array {
    return [['name' => 'warm', 'label' => 'Warm'], ['name' => 'cool', 'label' => 'Cool']];
  }

  public static function getTemplate(): ?string {
    return '~/afreactIslandForm/greeting.html';
  }

}
