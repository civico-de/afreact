<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * Display type editors of other extensions, which run as Angular islands in React's search builder.
 */
final class Islands {

  /**
   * Search builder modules whose display editors React has its own of.
   */
  private const REACT_EDITED = ['crmChartKitAdmin'];

  /**
   * Other extensions' Angular modules for core's search builder, but those their elements replace.
   *
   * @return list<string>
   */
  public static function modules(): array {
    $builderPage = AdminPage::classic('civicrm/admin/search');
    $islands = array_filter(
      Afforms::angular()->getModules(),
      static fn (mixed $module, int|string $name): bool => (
        in_array($builderPage, Record::array($module, 'basePages'), TRUE)
        && Record::string($module, 'ext') !== 'org.civicrm.search_kit'
        && !in_array($name, [...self::REACT_EDITED, ...BuilderPanels::replaced()], TRUE)
      ),
      ARRAY_FILTER_USE_BOTH,
    );
    return array_map(strval(...), array_keys($islands));
  }

}
