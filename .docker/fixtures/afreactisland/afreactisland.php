<?php

declare(strict_types = 1);

/**
 * Names the fixture's panel for afreact's search builder; the ang-php and mgd-php mixins
 * register the rest.
 */
function afreactisland_civicrm_config(): void {
  if (isset(\Civi::$statics[__FUNCTION__])) {
    return;
  }
  \Civi::$statics[__FUNCTION__] = TRUE;
  \Civi::dispatcher()->addListener('civi.afreact.assets', static function ($event): void {
    if ($event->builder === 'search_kit') {
      $event->panels[] = 'afreact-island-panel';
      \Civi::resources()->addScriptFile('afreactisland', 'js/panel.js');
    }
  });
}
