<?php

declare(strict_types = 1);

use Civi\Api4\Individual;

// Synthetic contacts for the demo table: 25 rows fill three pages of 10, so
// the pager and the row_count request of both renderers get exercised.
$first = ['Ada', 'Ben', 'Cleo', 'Dan', 'Eva'];
$last = ['Arendt', 'Brecht', 'Curie', 'Dürer', 'Euler'];
$records = [];
foreach ($last as $i => $lastName) {
  foreach ($first as $j => $firstName) {
    $records[] = [
      'first_name' => $firstName,
      'last_name' => $lastName,
      'gender_id' => (($i + $j) % 3) + 1,
      'birth_date' => sprintf('19%02d-%02d-%02d', 50 + ($i * 9) + $j, $j + 1, $i + 10),
      'source' => 'Afreact seed',
      'email_primary.email' => strtolower("{$firstName}.{$lastName}@example.org"),
    ];
  }
}
Individual::save(checkPermissions: FALSE)->setRecords($records)->execute();
