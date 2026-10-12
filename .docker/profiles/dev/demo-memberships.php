<?php

declare(strict_types = 1);

use Civi\Api4\Contribution;
use Civi\Api4\GroupContact;
use Civi\Api4\Individual;
use Civi\Api4\Membership;
use Civi\Api4\MembershipType;
use Civi\Api4\Organization;

// Membership types, members and their dues for the membership form and the members page of
// the afreactdemo fixture, which also brings the newsletter group and the fee fields.
$association = Organization::save(checkPermissions: FALSE)
  ->setRecords([[
    'organization_name' => 'Acme Association',
    'source' => 'Afreact seed',
    'external_identifier' => 'afreact-seed-association',
  ]])
  ->setMatch(['external_identifier'])
  ->execute()
  ->single()['id'];

$types = [];
$typeSpecs = [['Full', 60, 'year', 'Public'], ['Reduced', 30, 'year', 'Public'], ['Honorary', 0, 'lifetime', 'Admin']];
foreach ($typeSpecs as $weight => [$name, $fee, $unit, $visibility]) {
  $types[$name] = MembershipType::save(checkPermissions: FALSE)
    ->setRecords([[
      'name' => $name,
      'title' => "{$name} member",
      'member_of_contact_id' => $association,
      'financial_type_id:name' => 'Member Dues',
      'minimum_fee' => $fee,
      'duration_unit' => $unit,
      'duration_interval' => 1,
      'period_type' => 'rolling',
      'visibility' => $visibility,
      'weight' => $weight + 1,
    ]])
    ->setMatch(['name'])
    ->execute()
    ->single()['id'];
}

// Two of every three seed contacts are members: mostly full, every fifth reduced, every
// seventh honorary. They joined up to 30 months ago, so new, current, grace and expired occur.
$contacts = Individual::get(checkPermissions: FALSE)
  ->addSelect('id', 'external_identifier')
  ->addWhere('external_identifier', 'LIKE', 'afreact-seed-%')
  ->addOrderBy('external_identifier')
  ->execute();
$newsletter = [];
foreach ($contacts as $index => $contact) {
  if (($index % 3) === 2) {
    $newsletter[] = ['group_id:name' => 'Afreact_Demo_Newsletter', 'contact_id' => $contact['id'], 'status' => 'Added'];
    continue;
  }
  $type = match (TRUE) {
    ($index % 7) === 0 => 'Honorary',
    ($index % 5) === 0 => 'Reduced',
    default => 'Full',
  };
  $start = date('Y-m-d', strtotime(sprintf('-%d months', ($index * 7) % 30)));
  // Some full members keep the reason of a turned-down application, which the members page hides.
  $reason = match (TRUE) {
    $type === 'Reduced' => ['student', 'retired', 'unemployed'][$index % 3],
    $type === 'Full' && ($index % 4) === 1 => 'other',
    default => NULL,
  };
  $membership = Membership::save(checkPermissions: FALSE)
    ->setRecords([[
      'contact_id' => $contact['id'],
      'membership_type_id' => $types[$type],
      'join_date' => $start,
      'start_date' => $start,
      'source' => 'Afreact seed',
      'Afreact_Demo_Fee.Reduced' => $type === 'Reduced',
      'Afreact_Demo_Fee.Reason' => $reason,
    ]])
    ->setMatch(['contact_id', 'membership_type_id'])
    ->execute()
    ->single();
  if ($type === 'Honorary') {
    continue;
  }
  $contribution = Contribution::save(checkPermissions: FALSE)
    ->setRecords([[
      'contact_id' => $contact['id'],
      'financial_type_id:name' => 'Member Dues',
      'total_amount' => $type === 'Reduced' ? 30 : 60,
      'receive_date' => $start,
      'contribution_status_id:name' => 'Completed',
      'source' => 'Afreact seed',
      'trxn_id' => "{$contact['external_identifier']}-dues",
    ]])
    ->setMatch(['trxn_id'])
    ->execute()
    ->single();
  // APIv4 has no MembershipPayment entity.
  $payment = ['membership_id' => $membership['id'], 'contribution_id' => $contribution['id']];
  if (!civicrm_api3('MembershipPayment', 'getcount', $payment)) {
    civicrm_api3('MembershipPayment', 'create', $payment);
  }
}
GroupContact::save(checkPermissions: FALSE)->setRecords($newsletter)->setMatch(['group_id', 'contact_id'])->execute();
