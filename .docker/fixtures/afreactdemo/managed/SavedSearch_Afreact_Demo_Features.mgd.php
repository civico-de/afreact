<?php

declare(strict_types = 1);

/**
 * Table displays that use every table feature the React renderer draws, for the browser
 * tests that compare it with Angular: link and button columns, a row menu, a subsearch,
 * style rules, totals, a toolbar, and a collapsible hierarchy of contact types (the dev stack
 * seeds sub-types in .docker/init.d). A subsearch filters only on fields its own search selects,
 * so the emails select contact_id.
 */
$view = 'civicrm/contact/view?reset=1&cid=[id]';

return [
  [
    'name' => 'SavedSearch_Afreact_Demo_Emails',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Emails',
        'label' => 'Afreact demo emails',
        'api_entity' => 'Email',
        'api_params' => [
          'version' => 4,
          'select' => ['id', 'contact_id', 'email', 'location_type_id:label', 'is_primary'],
          'orderBy' => [],
          'where' => [],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Emails_Table',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Emails_Table',
        'label' => 'Emails',
        'saved_search_id.name' => 'Afreact_Demo_Emails',
        'type' => 'table',
        'settings' => [
          'limit' => 5,
          'classes' => ['table'],
          'pager' => FALSE,
          'sort' => [['email', 'ASC']],
          'columns' => [
            ['type' => 'field', 'key' => 'email', 'label' => 'Email', 'sortable' => TRUE],
            ['type' => 'field', 'key' => 'location_type_id:label', 'label' => 'Location', 'sortable' => TRUE],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
  [
    'name' => 'SavedSearch_Afreact_Demo_Features',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Features',
        'label' => 'Afreact demo table features',
        'api_entity' => 'Individual',
        'api_params' => [
          'version' => 4,
          'select' => [
            'id',
            'sort_name',
            'first_name',
            'gender_id:label',
            'gender_id:name',
            'email_primary.email',
            'image_URL',
          ],
          'orderBy' => [],
          'where' => [['is_deleted', '=', FALSE], ['source', '=', 'Afreact seed']],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Features_Table',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Features_Table',
        'label' => 'Table features',
        'saved_search_id.name' => 'Afreact_Demo_Features',
        'type' => 'table',
        'settings' => [
          'description' => 'Synthetic contacts in every kind of column.',
          'limit' => 5,
          'placeholder' => 3,
          'classes' => ['table', 'table-striped'],
          'pager' => ['show_count' => TRUE],
          'headerCount' => TRUE,
          'sort' => [['sort_name', 'ASC']],
          'cssRules' => [['bg-warning', 'gender_id:name', '=', 'Female']],
          'tally' => ['label' => 'Total'],
          'toolbar' => [
            [
              'path' => 'civicrm/contact/add?reset=1&ct=Individual',
              'text' => 'Add contact',
              'icon' => 'fa-plus',
              'style' => 'primary',
              'target' => 'crm-popup',
            ],
          ],
          'columns' => [
            [
              'type' => 'field',
              'key' => 'sort_name',
              'label' => 'Name',
              'sortable' => TRUE,
              'link' => ['path' => $view, 'target' => '_blank'],
              'title' => 'View [sort_name]',
              'icons' => [['icon' => 'fa-user', 'side' => 'left']],
              'tally' => ['fn' => 'COUNT', 'label' => 'Count:'],
            ],
            [
              'type' => 'field',
              'key' => 'first_name',
              'label' => 'First name',
              'sortable' => TRUE,
              'rewrite' => '[first_name] ([gender_id:label])',
              'alignment' => 'text-right',
              'cssRules' => [['font-bold'], ['text-danger', 'gender_id:name', '=', 'Male']],
            ],
            [
              'type' => 'field',
              'key' => 'email_primary.email',
              'label' => 'Email',
              'sortable' => TRUE,
              'empty_value' => 'No email',
              'icons' => [['icon' => 'fa-envelope', 'side' => 'right']],
            ],
            [
              'type' => 'image',
              'key' => 'image_URL',
              'label' => 'Photo',
              'empty_value' => '/core/i/contact_ind.gif',
              'image' => ['alt' => 'Photo of [sort_name]', 'width' => 16, 'height' => 16],
              'link' => ['path' => $view, 'target' => ''],
            ],
            [
              'type' => 'html',
              'key' => 'first_name',
              'label' => 'Markup',
              'rewrite' => '<em>[first_name]</em>',
            ],
            [
              'type' => 'links',
              'label' => 'Links',
              'links' => [
                ['path' => $view, 'text' => 'View', 'icon' => 'fa-eye', 'style' => 'info', 'target' => ''],
                [
                  'entity' => 'Individual',
                  'action' => 'update',
                  'text' => 'Edit',
                  'icon' => 'fa-pencil',
                  'style' => 'warning',
                  'target' => 'crm-popup',
                  'conditions' => [['gender_id:name', '=', 'Female']],
                ],
              ],
            ],
            [
              'type' => 'buttons',
              'label' => 'Buttons',
              'size' => 'btn-xs',
              'links' => [
                [
                  'path' => $view,
                  'text' => 'Open',
                  'icon' => 'fa-external-link',
                  'style' => 'default',
                  'target' => '_blank',
                  'title' => 'Open [sort_name]',
                ],
              ],
            ],
            [
              'type' => 'subsearch',
              'label' => 'Emails',
              'rewrite' => 'Emails',
              'subsearch' => [
                'search' => 'Afreact_Demo_Emails',
                'display' => 'Afreact_Demo_Emails_Table',
                'filters' => [['subsearch_field' => 'contact_id', 'parent_field' => 'id']],
                'subsearch_mode' => 'dropdown',
              ],
            ],
            [
              'type' => 'menu',
              'text' => 'Actions',
              'label' => 'Actions',
              'style' => 'default',
              'size' => 'btn-xs',
              'icon' => 'fa-bars',
              'alignment' => 'text-right',
              'links' => [
                [
                  'path' => $view,
                  'text' => 'View',
                  'icon' => 'fa-eye',
                  'style' => 'default',
                  'target' => '_blank',
                ],
                [
                  'entity' => 'Individual',
                  'action' => 'update',
                  'text' => 'Edit',
                  'icon' => 'fa-pencil',
                  'style' => 'default',
                  'target' => 'crm-popup',
                ],
                [
                  'path' => 'civicrm/contact/view/delete?reset=1&delete=1&cid=[id]',
                  'text' => 'Delete',
                  'icon' => 'fa-trash',
                  'style' => 'danger',
                  'target' => 'crm-popup',
                ],
              ],
            ],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
  [
    'name' => 'SavedSearch_Afreact_Demo_Contact_Types',
    'entity' => 'SavedSearch',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Contact_Types',
        'label' => 'Afreact demo contact types',
        'api_entity' => 'ContactType',
        'api_params' => [
          'version' => 4,
          'select' => ['id', 'label', 'name', 'parent_id:label'],
          'orderBy' => [],
          'where' => [],
        ],
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'SearchDisplay_Afreact_Demo_Contact_Types_Table',
    'entity' => 'SearchDisplay',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Contact_Types_Table',
        'label' => 'Contact types',
        'saved_search_id.name' => 'Afreact_Demo_Contact_Types',
        'type' => 'table',
        'settings' => [
          'limit' => 50,
          'classes' => ['table'],
          'pager' => FALSE,
          'hierarchical' => TRUE,
          'collapsible' => 'closed',
          'sort' => [['label', 'ASC']],
          'columns' => [
            ['type' => 'field', 'key' => 'label', 'label' => 'Label'],
            ['type' => 'field', 'key' => 'name', 'label' => 'Name'],
            ['type' => 'field', 'key' => 'parent_id:label', 'label' => 'Parent'],
          ],
        ],
      ],
      'match' => ['name', 'saved_search_id'],
    ],
  ],
];
