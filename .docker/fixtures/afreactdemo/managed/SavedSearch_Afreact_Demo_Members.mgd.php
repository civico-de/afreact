<?php

declare(strict_types = 1);

/**
 * The members page: every membership with its member, type, status and fee, and the
 * memberships counted by type and status.
 */
return [
  [
    'name' => 'SavedSearch_Afreact_Demo_Members',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Members',
        'label' => 'Afreact demo members',
        'api_entity' => 'Membership',
        'api_params' => [
          'version' => 4,
          'select' => [
            'id',
            'contact_id.sort_name',
            'membership_type_id:label',
            'status_id:label',
            'start_date',
            'end_date',
            'Afreact_Demo_Fee.Reduced',
            'Afreact_Demo_Fee.Reason:label',
          ],
          'orderBy' => [],
          'where' => [],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Members_Table',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Members_Table',
        'label' => 'Members',
        'saved_search_id.name' => 'Afreact_Demo_Members',
        'type' => 'table',
        'settings' => [
          'limit' => 10,
          'classes' => ['table', 'table-striped'],
          'pager' => ['show_count' => TRUE, 'expose_limit' => TRUE],
          'actions' => ['download'],
          'sort' => [['contact_id.sort_name', 'ASC']],
          'columns' => [
            [
              'type' => 'field',
              'key' => 'contact_id.sort_name',
              'label' => 'Member',
              'sortable' => TRUE,
              'link' => ['entity' => 'Contact', 'action' => 'view', 'join' => 'contact_id', 'target' => '_blank'],
            ],
            ['type' => 'field', 'key' => 'membership_type_id:label', 'label' => 'Type', 'sortable' => TRUE],
            ['type' => 'field', 'key' => 'status_id:label', 'label' => 'Status', 'sortable' => TRUE],
            ['type' => 'field', 'key' => 'start_date', 'label' => 'Since', 'sortable' => TRUE],
            ['type' => 'field', 'key' => 'end_date', 'label' => 'Until', 'sortable' => TRUE],
            [
              'type' => 'field',
              'key' => 'Afreact_Demo_Fee.Reduced',
              'label' => 'Reduced fee',
              'sortable' => TRUE,
              'rewrite' => '{if $Afreact_Demo_Fee.Reduced}[Afreact_Demo_Fee.Reason:label]{/if}',
            ],
          ],
          'cssRules' => [
            ['text-muted', 'status_id:name', 'IN', ['Expired', 'Cancelled', 'Deceased']],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
  [
    'name' => 'SavedSearch_Afreact_Demo_Members_By_Type',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Members_By_Type',
        'label' => 'Afreact demo members by type',
        'api_entity' => 'Membership',
        'api_params' => [
          'version' => 4,
          'select' => ['membership_type_id:label', 'status_id:label', 'COUNT(id) AS COUNT_id'],
          'orderBy' => [],
          'where' => [],
          'groupBy' => ['membership_type_id', 'status_id'],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Members_By_Type_Table',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Members_By_Type_Table',
        'label' => 'Members by type and status',
        'saved_search_id.name' => 'Afreact_Demo_Members_By_Type',
        'type' => 'table',
        'settings' => [
          'limit' => 0,
          'classes' => ['table'],
          'pager' => FALSE,
          'sort' => [['membership_type_id:label', 'ASC'], ['status_id:label', 'ASC']],
          'tally' => ['label' => 'Total'],
          'columns' => [
            ['type' => 'field', 'key' => 'membership_type_id:label', 'label' => 'Type', 'sortable' => TRUE],
            ['type' => 'field', 'key' => 'status_id:label', 'label' => 'Status', 'sortable' => TRUE],
            [
              'type' => 'field',
              'key' => 'COUNT_id',
              'label' => 'Members',
              'sortable' => TRUE,
              'tally' => ['fn' => 'SUM'],
            ],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
];
