<?php

declare(strict_types = 1);

use CRM_Afreact_ExtensionUtil as E;

/**
 * Navigation entries as a hierarchical, draggable table and as a draggable tree, for the browser
 * tests that compare dragging on both renderers. The forms filter by name.
 */
return [
  [
    'name' => 'SavedSearch_Afreact_Demo_NavTree',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Nav_Tree',
        'label' => E::ts('Afreact demo navigation tree'),
        'api_entity' => 'Navigation',
        'api_params' => [
          'version' => 4,
          'select' => ['id', 'label', 'weight', 'name'],
          'orderBy' => [],
          'where' => [],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Nav_Tree_Table',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Nav_Tree_Table',
        'label' => E::ts('Navigation tree'),
        'saved_search_id.name' => 'Afreact_Demo_Nav_Tree',
        'type' => 'table',
        'settings' => [
          'limit' => 50,
          'classes' => ['table'],
          'pager' => ['show_count' => TRUE],
          'hierarchical' => TRUE,
          'draggable' => 'weight',
          'sort' => [['weight', 'ASC']],
          'columns' => [
            ['type' => 'field', 'key' => 'label', 'label' => E::ts('Label')],
            ['type' => 'field', 'key' => 'weight', 'label' => E::ts('Order')],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Nav_Tree_Tree',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Nav_Tree_Tree',
        'label' => E::ts('Navigation tree items'),
        'saved_search_id.name' => 'Afreact_Demo_Nav_Tree',
        'type' => 'tree',
        'settings' => [
          'limit' => 50,
          'parent_field' => 'parent_id',
          'draggable' => 'weight',
          'sort' => [['weight', 'ASC']],
          'columns' => [
            ['type' => 'field', 'key' => 'label', 'label' => E::ts('Label')],
            ['type' => 'field', 'key' => 'weight', 'label' => E::ts('Order')],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
];
