<?php

declare(strict_types = 1);

use Civi\Api4\Event;
use Civi\Api4\Individual;
use Civi\Api4\Participant;

// Past and coming events with participants, for event forms and participant displays.
$eventSpecs = [
  ['Annual General Meeting', 'Meeting', '-2 months 18:00', '+3 hours', FALSE, NULL],
  ['Volunteer Workshop', 'Workshop', '+3 weeks 10:00', '+6 hours', TRUE, 12],
  ['Summer Conference', 'Conference', '+4 months 09:00', '+2 days 17:00', TRUE, 200],
  ['Charity Gala', 'Fundraiser', '-8 months 19:00', '+4 hours', FALSE, NULL],
];
$events = [];
foreach ($eventSpecs as [$title, $type, $start, $length, $registration, $max]) {
  $startDate = strtotime($start);
  $events[] = Event::save(checkPermissions: FALSE)
    ->setRecords([[
      'title' => $title,
      'event_type_id:name' => $type,
      'start_date' => date('Y-m-d H:i:s', $startDate),
      'end_date' => date('Y-m-d H:i:s', strtotime($length, $startDate)),
      'summary' => "{$type} of the seed data.",
      'is_active' => TRUE,
      'is_public' => TRUE,
      'is_online_registration' => $registration,
      'max_participants' => $max,
      'default_role_id:name' => 'Attendee',
    ]])
    ->setMatch(['title'])
    ->execute()
    ->single() + ['past' => $startDate < time()];
}

// Three of every four seed contacts take part in one event, every sixth in a second one.
// Past events have attended and no-show participants, coming ones registered and cancelled.
$contacts = Individual::get(checkPermissions: FALSE)
  ->addSelect('id')
  ->addWhere('external_identifier', 'LIKE', 'afreact-seed-%')
  ->addOrderBy('external_identifier')
  ->execute();
$participants = [];
foreach ($contacts as $index => $contact) {
  if (($index % 4) === 3) {
    continue;
  }
  $taken = ($index % 6) === 0 ? [$index, $index + 1] : [$index];
  foreach ($taken as $number) {
    $event = $events[$number % count($events)];
    $participants[] = [
      'contact_id' => $contact['id'],
      'event_id' => $event['id'],
      'status_id:name' => match (TRUE) {
        $event['past'] => ($index % 5) === 0 ? 'No-show' : 'Attended',
        default => ($index % 7) === 0 ? 'Cancelled' : 'Registered',
      },
      'role_id:name' => [match (TRUE) {
        ($index % 9) === 0 => 'Speaker',
        ($index % 6) === 0 => 'Volunteer',
        default => 'Attendee',
      }],
      'register_date' => date('Y-m-d H:i:s', strtotime(
        sprintf('-%d days', 10 + $index),
        strtotime($event['start_date']),
      )),
      'source' => 'Afreact seed',
    ];
  }
}
Participant::save(checkPermissions: FALSE)->setRecords($participants)->setMatch(['contact_id', 'event_id'])->execute();
