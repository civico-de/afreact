<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Afform\Placement\PlacementUtils;
use CRM_Afreact_ExtensionUtil as E;

/**
 * The arguments a placed form's placements would pass, as the render page's picker gives them.
 */
final class PlacementArguments {

  /**
   * The entities the form's placements pass, by option key, e.g. contact_id => Contact.
   *
   * @param array<mixed> $form
   * @return array<string, string>
   */
  public static function entities(array $form): array {
    $placements = PlacementUtils::getPlacements();
    $entities = [];
    foreach (array_filter(Record::array($form, 'placement'), is_string(...)) as $name) {
      foreach (array_filter(Record::array($placements[$name] ?? NULL, 'entities'), is_string(...)) as $key => $entity) {
        $entities[(string) $key] ??= $entity;
      }
    }
    return $entities;
  }

  /**
   * The placement arguments the picker sent; a cleared one stays empty. A contact not sent is
   * the user's own where it is the only argument: beside a case it would be that case's client.
   *
   * @param array<string, string> $entities
   * @return array<string, int>
   */
  public static function picked(array $entities): array {
    $own = \CRM_Core_Session::getLoggedInContactID();
    $ownContact = array_values($entities) === ['Contact'] && is_numeric($own) ? (int) $own : NULL;
    $picked = [];
    foreach (array_keys($entities) as $key) {
      $field = "placement_{$key}";
      $given = \CRM_Utils_Request::retrieveValue($field, 'String', method: 'GET');
      $id = $given === NULL ? $ownContact : self::recordId($field, $given);
      if ($id !== NULL) {
        $picked[$key] = $id;
      }
    }
    return $picked;
  }

  /**
   * The record ID the picker sent in `$field`, NULL when cleared.
   */
  private static function recordId(string $field, mixed $given): ?int {
    if ($given === '') {
      return NULL;
    }
    if (!is_string($given) || preg_match('/^[1-9]\d*$/', $given) !== 1) {
      throw new \CRM_Core_Exception(E::ts('%1 must be a record ID.', [1 => $field]));
    }
    return (int) $given;
  }

}
