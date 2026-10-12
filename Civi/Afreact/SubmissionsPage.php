<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use CRM_AfformAdmin_ExtensionUtil as AfformAdmin;

/**
 * The page chrome of FormBuilder's submissions route, whose table React renders.
 */
final class SubmissionsPage {

  /**
   * Title and breadcrumbs as CRM_AfformAdmin_Page_Submissions sets them; React reports a missing
   * or unknown form. Returns the form's name, which core's page needs too.
   */
  public static function chrome(): ?string {
    $raw = \CRM_Utils_Request::retrieveValue('name', 'String', method: 'GET');
    $name = is_string($raw) && $raw !== '' ? $raw : NULL;
    $afform = $name === NULL
      ? NULL
      : Afform::get()->addWhere('name', '=', $name)->addSelect('title', 'server_route')->execute()->first();
    if (!is_array($afform)) {
      return $name;
    }
    $title = Record::string($afform, 'title') ?? '';
    \CRM_Utils_System::setTitle((string) AfformAdmin::ts('Submissions for %1', [1 => $title]));
    \CRM_Utils_System::resetBreadCrumb();
    \CRM_Utils_System::appendBreadCrumb([
      [
        'title' => AfformAdmin::ts('CiviCRM'),
        'url' => (string) \Civi::url('current://civicrm', 'h'),
      ],
      [
        'title' => AfformAdmin::ts('FormBuilder'),
        'url' => (string) \Civi::url('current://civicrm/admin/afform', 'h'),
      ],
    ]);
    $route = Record::string($afform, 'server_route');
    if ($route) {
      \CRM_Utils_System::appendBreadCrumb([[
        'title' => $title,
        'url' => (string) \Civi::url('current://' . $route, 'h'),
      ]]);
    }
    return $name;
  }

}
