<?php

declare(strict_types = 1);

use CRM_Afreact_ExtensionUtil as E;

/**
 * Contacts with in-place editable columns (a text and an option list) and the column picker,
 * for the browser tests that compare in-place editing on both renderers.
 */
return [
  [
    'name' => 'SavedSearch_Afreact_Demo_Editable',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Editable',
        'label' => E::ts('Afreact demo editable contacts'),
        'api_entity' => 'Individual',
        'api_params' => [
          'version' => 4,
          'select' => ['id', 'sort_name', 'job_title', 'gender_id:label'],
          'orderBy' => [],
          'where' => [['is_deleted', '=', FALSE]],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Editable_Table',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Editable_Table',
        'label' => E::ts('Editable contacts'),
        'saved_search_id.name' => 'Afreact_Demo_Editable',
        'type' => 'table',
        'settings' => [
          'limit' => 10,
          'classes' => ['table', 'table-striped'],
          'pager' => [],
          'sort' => [['sort_name', 'ASC']],
          'toggleColumns' => TRUE,
          'columns' => [
            [
              'type' => 'field',
              'key' => 'sort_name',
              'label' => E::ts('Name'),
              'sortable' => TRUE,
            ],
            [
              'type' => 'field',
              'key' => 'job_title',
              'label' => E::ts('Job title'),
              'sortable' => TRUE,
              'editable' => TRUE,
            ],
            [
              'type' => 'field',
              'key' => 'gender_id:label',
              'label' => E::ts('Gender'),
              'sortable' => TRUE,
              'editable' => TRUE,
            ],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
];
