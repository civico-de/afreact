<?php

declare(strict_types = 1);

use CRM_Afreact_ExtensionUtil as E;

/**
 * A table with bulk actions for the browser tests: groups the test creates itself (named
 * afreact_actions_*), so enabling, disabling and deleting them touches no other data.
 */
return [
  [
    'name' => 'SavedSearch_Afreact_Demo_Groups',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Groups',
        'label' => E::ts('Afreact demo groups'),
        'api_entity' => 'Group',
        'api_params' => [
          'version' => 4,
          'select' => ['id', 'title', 'is_active'],
          'orderBy' => [],
          'where' => [['name', 'LIKE', 'afreact_actions_%']],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Groups_Table',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Groups_Table',
        'label' => E::ts('Groups'),
        'saved_search_id.name' => 'Afreact_Demo_Groups',
        'type' => 'table',
        'settings' => [
          'limit' => 10,
          'classes' => ['table'],
          'pager' => ['show_count' => TRUE],
          'actions' => ['enable', 'disable', 'delete'],
          'sort' => [['title', 'ASC']],
          'columns' => [
            ['type' => 'field', 'key' => 'title', 'label' => E::ts('Title'), 'sortable' => TRUE],
            ['type' => 'field', 'key' => 'is_active', 'label' => E::ts('Enabled'), 'sortable' => TRUE],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
];
