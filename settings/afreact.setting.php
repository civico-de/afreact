<?php

declare(strict_types = 1);

use CRM_Afreact_ExtensionUtil as E;

return [
  'afreact_forms' => [
    'name' => 'afreact_forms',
    'type' => 'Array',
    'html_type' => 'select',
    'html_attributes' => [
      'multiple' => 1,
      'class' => 'crm-select2 huge',
    ],
    'default' => [],
    'title' => E::ts('Forms rendered with React'),
    'description' => E::ts(
      'On their pages, contact summary tabs and blocks, case summary blocks and dashboard dashlets these forms render with React. All other forms stay Angular.',
    ),
    'is_domain' => 1,
    'is_contact' => 0,
    'pseudoconstant' => ['callback' => 'Civi\Afreact\Takeover::formOptions'],
    'settings_pages' => ['afreact' => ['weight' => 10]],
    // Form pages are menu routes, swapped when the menu is rebuilt; dashlets are Angular partials.
    'post_change' => ['Civi\Afreact\Takeover::rebuildMenu', 'Civi\Afreact\Dashlets::clearAngular'],
  ],
  'afreact_builders' => [
    'name' => 'afreact_builders',
    'type' => 'Array',
    'html_type' => 'select',
    'html_attributes' => [
      'multiple' => 1,
      'class' => 'crm-select2 huge',
    ],
    'default' => [],
    'title' => E::ts('Builders opened with React'),
    'description' => E::ts(
      'Links to these builders open the React builder. Core\'s builder stays one link away at its classic address.',
    ),
    'is_domain' => 1,
    'is_contact' => 0,
    'pseudoconstant' => ['callback' => 'Civi\Afreact\Builders::options'],
    'settings_pages' => ['afreact' => ['weight' => 20]],
    'post_change' => ['Civi\Afreact\Builders::rebuild'],
  ],
];
