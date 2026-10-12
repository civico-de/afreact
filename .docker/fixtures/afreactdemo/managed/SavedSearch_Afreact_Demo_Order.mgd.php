<?php

declare(strict_types = 1);

/**
 * A draggable table for the browser tests: the options of a group the test creates itself
 * (afreact_demo_order), so reordering them touches no other data.
 */
return [
  [
    'name' => 'SavedSearch_Afreact_Demo_Order',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Order',
        'label' => 'Afreact demo order',
        'api_entity' => 'OptionValue',
        'api_params' => [
          'version' => 4,
          'select' => ['id', 'label', 'weight'],
          'orderBy' => [],
          'where' => [['option_group_id:name', '=', 'afreact_demo_order']],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Order_Table',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Order_Table',
        'label' => 'Options',
        'saved_search_id.name' => 'Afreact_Demo_Order',
        'type' => 'table',
        'settings' => [
          'limit' => 10,
          'classes' => ['table'],
          'pager' => ['show_count' => TRUE],
          'draggable' => 'weight',
          'sort' => [['weight', 'ASC']],
          'columns' => [
            ['type' => 'field', 'key' => 'label', 'label' => 'Label'],
            ['type' => 'field', 'key' => 'weight', 'label' => 'Order'],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
];
