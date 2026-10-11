<?php

declare(strict_types = 1);

return [
  [
    'name' => 'SearchDisplayType:afreact-island',
    'entity' => 'OptionValue',
    'cleanup' => 'always',
    'update' => 'always',
    'params' => [
      'version' => 4,
      'values' => [
        'option_group_id:name' => 'search_display_type',
        'value' => 'afreact-island',
        'name' => 'crm-search-display-afreact-island',
        'label' => 'Island',
        'icon' => 'fa-tree',
        'description' => 'A note on the search, edited in Angular.',
        'is_active' => TRUE,
      ],
      'match' => ['option_group_id', 'name'],
    ],
  ],
];
