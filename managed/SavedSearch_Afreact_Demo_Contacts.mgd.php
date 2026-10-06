<?php

declare(strict_types = 1);

use CRM_Afreact_ExtensionUtil as E;

/**
 * Contact list for the demo page; the name links back to the React form in edit mode.
 */
return [
  [
    'name' => 'SavedSearch_Afreact_Demo_Contacts',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Contacts',
        'label' => E::ts('Afreact demo contacts'),
        'api_entity' => 'Individual',
        'api_params' => [
          'version' => 4,
          'select' => ['id', 'sort_name', 'email_primary.email', 'gender_id:label', 'birth_date', 'created_date'],
          'orderBy' => [],
          'where' => [['is_deleted', '=', FALSE]],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Contacts_Table',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Contacts_Table',
        'label' => E::ts('Contacts'),
        'saved_search_id.name' => 'Afreact_Demo_Contacts',
        'type' => 'table',
        'settings' => [
          'limit' => 10,
          'classes' => ['table', 'table-striped'],
          'pager' => ['show_count' => TRUE],
          'sort' => [['sort_name', 'ASC']],
          'actions' => TRUE,
          'columns' => [
            [
              'type' => 'field',
              'key' => 'sort_name',
              'label' => E::ts('Name'),
              'sortable' => TRUE,
              'link' => [
                'path' => 'civicrm/afreact/demo?Individual1=[id]',
                'target' => '',
              ],
              'title' => E::ts('Edit in the React form'),
            ],
            [
              'type' => 'field',
              'key' => 'email_primary.email',
              'label' => E::ts('Email'),
              'sortable' => TRUE,
            ],
            [
              'type' => 'field',
              'key' => 'gender_id:label',
              'label' => E::ts('Gender'),
              'sortable' => TRUE,
            ],
            [
              'type' => 'field',
              'key' => 'birth_date',
              'label' => E::ts('Birth date'),
              'sortable' => TRUE,
            ],
            [
              'type' => 'field',
              'key' => 'created_date',
              'label' => E::ts('Created'),
              'sortable' => TRUE,
            ],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
];
