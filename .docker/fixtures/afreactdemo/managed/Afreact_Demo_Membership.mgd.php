<?php

declare(strict_types = 1);

/**
 * What the membership form needs besides core: a newsletter to subscribe to and the custom
 * fields of a reduced fee. Membership types and members are seed data of the dev stack.
 */
return [
  [
    'name' => 'Group_Afreact_Demo_Newsletter',
    'entity' => 'Group',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Newsletter',
        'title' => 'Afreact demo newsletter',
        'frontend_title' => 'Newsletter',
        'frontend_description' => 'News of the association, once a month.',
        'group_type:name' => ['Mailing List'],
        'visibility' => 'Public Pages',
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'OptionGroup_Afreact_Demo_Reduction_Reason',
    'entity' => 'OptionGroup',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'afreact_demo_reduction_reason',
        'title' => 'Afreact demo reduction reason',
        'data_type' => 'String',
        'is_reserved' => FALSE,
      ],
      'match' => ['name'],
    ],
  ],
  ...array_map(
    static fn (array $option): array => [
      'name' => "OptionValue_Afreact_Demo_Reduction_Reason_{$option[0]}",
      'entity' => 'OptionValue',
      'cleanup' => 'unused',
      'update' => 'unmodified',
      'params' => [
        'version' => 4,
        'values' => [
          'option_group_id.name' => 'afreact_demo_reduction_reason',
          'name' => $option[0],
          'value' => $option[0],
          'label' => $option[1],
          'weight' => $option[2],
        ],
        'match' => ['option_group_id', 'name'],
      ],
    ],
    [
      ['student', 'Student or trainee', 1],
      ['unemployed', 'Unemployed', 2],
      ['retired', 'Retired', 3],
      ['other', 'Other', 4],
    ],
  ),
  [
    'name' => 'CustomGroup_Afreact_Demo_Fee',
    'entity' => 'CustomGroup',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'name' => 'Afreact_Demo_Fee',
        'title' => 'Fee',
        'extends' => 'Membership',
        'style' => 'Inline',
        'collapse_display' => FALSE,
      ],
      'match' => ['name'],
    ],
  ],
  [
    'name' => 'CustomField_Afreact_Demo_Fee_Reduced',
    'entity' => 'CustomField',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'custom_group_id.name' => 'Afreact_Demo_Fee',
        'name' => 'Reduced',
        'label' => 'Apply for a reduced fee',
        'data_type' => 'Boolean',
        'html_type' => 'Radio',
        'default_value' => '0',
      ],
      'match' => ['custom_group_id', 'name'],
    ],
  ],
  [
    'name' => 'CustomField_Afreact_Demo_Fee_Reason',
    'entity' => 'CustomField',
    'cleanup' => 'unused',
    'update' => 'unmodified',
    'params' => [
      'version' => 4,
      'values' => [
        'custom_group_id.name' => 'Afreact_Demo_Fee',
        'name' => 'Reason',
        'label' => 'Reason for the reduced fee',
        'data_type' => 'String',
        'html_type' => 'Select',
        'option_group_id.name' => 'afreact_demo_reduction_reason',
      ],
      'match' => ['custom_group_id', 'name'],
    ],
  ],
];
