<?php

declare(strict_types = 1);

/**
 * Implements hook_civicrm_angularModules(): the display's runtime module and its search builder editor.
 *
 * @param array<string, array<string, mixed>> $angularModules
 */
function afreactisland_civicrm_angularModules(array &$angularModules): void {
  $angularModules['afreactIsland'] = [
    'ext' => 'afreactisland',
    'js' => ['ang/afreactIsland.js'],
    'requires' => [],
    'basePages' => [],
    'exports' => ['crm-search-display-afreact-island' => 'E'],
  ];
  $angularModules['afreactIslandAdmin'] = [
    'ext' => 'afreactisland',
    'js' => ['ang/afreactIslandAdmin.js'],
    'requires' => ['crmSearchAdmin', 'afreactIsland'],
    'basePages' => ['civicrm/admin/search'],
  ];
}
