<?php

declare(strict_types = 1);

use Civi\Api4\ContactType;

// Sub-types for the collapsible hierarchy of the contact-types demo table.
ContactType::save(checkPermissions: FALSE)
  ->setRecords([
    ['name' => 'Afreact_Demo_Staff', 'label' => 'Afreact demo staff', 'parent_id.name' => 'Individual'],
    ['name' => 'Afreact_Demo_Volunteer', 'label' => 'Afreact demo volunteer', 'parent_id.name' => 'Individual'],
    ['name' => 'Afreact_Demo_Club', 'label' => 'Afreact demo club', 'parent_id.name' => 'Organization'],
  ])
  ->setMatch(['name'])
  ->execute();
