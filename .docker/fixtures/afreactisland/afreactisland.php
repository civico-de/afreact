<?php

declare(strict_types = 1);

/**
 * Names the fixture's panels for afreact's builders and its FormBuilder plugins; the
 * ang-php, mgd-php and scan-classes mixins register the rest.
 */
function afreactisland_civicrm_config(): void {
  if (isset(\Civi::$statics[__FUNCTION__])) {
    return;
  }
  \Civi::$statics[__FUNCTION__] = TRUE;
  \Civi::dispatcher()->addListener('civi.afreact.assets', static function (\Civi\Afreact\AssetsEvent $event): void {
    if ($event->builder === 'search_kit') {
      $event->panels[] = 'afreact-island-panel';
      \Civi::resources()->addScriptFile('afreactisland', 'js/panel.js');
    }
    if ($event->builder === 'afform') {
      $event->panels[] = 'afreact-island-form-panel';
      \Civi::resources()->addScriptFile('afreactisland', 'js/form-plugins.js');
    }
  });
  \Civi::dispatcher()->addListener('civi.afform_admin.metadata', static function ($event): void {
    $event->elements['afreactIslandNote'] = [
      'title' => 'Island note',
      'afform_type' => ['form'],
      'directive' => 'afreact-island-note',
      'admin_tpl' => '~/afreactIslandForm/note.html',
      'element' => ['#tag' => 'afreact-island-note', 'text' => 'Island note'],
    ];
    $event->entities['Household']['options_tpl'] = '~/afreactIslandForm/household.html';
  });
  \Civi::dispatcher()->addListener('civi.afform.input_types', static function ($event): void {
    $event->inputTypes['IslandStars'] = [
      'label' => 'Island stars',
      'template' => '~/afreactIslandForm/stars.html',
      'admin_template' => '~/afreactIslandForm/stars-admin.html',
      'extra_defn' => ['data_type' => 'String'],
    ];
  });
}
