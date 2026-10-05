<?php

declare(strict_types = 1);

use CRM_Afreact_ExtensionUtil as E;

/**
 * A list, a grid and a tree display for the browser tests that compare both renderers: activity
 * types as a numbered list with a pager, prefixes as a two-column grid, contact types as a tree.
 */
return [
  [
    'name' => 'SavedSearch_Afreact_Demo_Option_Values',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Option_Values',
        'label' => E::ts('Afreact demo option values'),
        'api_entity' => 'OptionValue',
        'api_params' => [
          'version' => 4,
          'select' => ['id', 'label', 'value', 'name', 'option_group_id:name', 'is_active'],
          'orderBy' => [],
          'where' => [],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Activity_Types_List',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Activity_Types_List',
        'label' => E::ts('Activity types'),
        'saved_search_id.name' => 'Afreact_Demo_Option_Values',
        'type' => 'list',
        'settings' => [
          'style' => 'ol',
          'limit' => 10,
          'pager' => ['show_count' => TRUE],
          'placeholder' => 5,
          'sort' => [['label', 'ASC']],
          'columns' => [
            ['type' => 'field', 'key' => 'label', 'label' => '', 'cssRules' => [['font-bold']]],
            ['type' => 'field', 'key' => 'name', 'label' => E::ts('Name'), 'forceLabel' => TRUE],
            [
              'type' => 'field',
              'key' => 'is_active',
              'label' => E::ts('Enabled'),
              'break' => TRUE,
              'cssRules' => [['text-muted', 'is_active', '=', FALSE]],
            ],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Prefixes_Grid',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Prefixes_Grid',
        'label' => E::ts('Prefixes'),
        'saved_search_id.name' => 'Afreact_Demo_Option_Values',
        'type' => 'grid',
        'settings' => [
          'colno' => '2',
          'limit' => 50,
          'pager' => FALSE,
          'placeholder' => 4,
          'sort' => [['value', 'ASC']],
          'columns' => [
            ['type' => 'field', 'key' => 'label', 'label' => E::ts('Prefix'), 'break' => TRUE],
            ['type' => 'field', 'key' => 'value', 'label' => E::ts('Value'), 'break' => TRUE],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
  [
    'name' => 'SavedSearch_Afreact_Demo_Contact_Type_Tree',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Contact_Type_Tree',
        'label' => E::ts('Afreact demo contact type tree'),
        'api_entity' => 'ContactType',
        'api_params' => [
          'version' => 4,
          'select' => ['id', 'label', 'name', 'parent_id'],
          'orderBy' => [],
          'where' => [],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Contact_Type_Tree',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Contact_Type_Tree',
        'label' => E::ts('Contact type tree'),
        'saved_search_id.name' => 'Afreact_Demo_Contact_Type_Tree',
        'type' => 'tree',
        'settings' => [
          'parent_field' => 'parent_id',
          'collapsible' => 'closed',
          'limit' => 50,
          'placeholder' => 3,
          'sort' => [['label', 'ASC']],
          'columns' => [
            ['type' => 'field', 'key' => 'label', 'label' => ''],
            ['type' => 'field', 'key' => 'name', 'label' => E::ts('Name'), 'forceLabel' => TRUE],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
];
