<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use Civi\Api4\Navigation;
use CRM_Afreact_ExtensionUtil as E;

/**
 * Title, breadcrumb and public-page handling of a form's page, as in
 * CRM_Afform_Page_AfformBase::run().
 */
final class FormPageTitle {

  public static function apply(\CRM_Core_Page $page, string $name): void {
    $afform = Afform::get()
      ->addWhere('name', '=', $name)
      ->addSelect('title', 'navigation', 'is_public')
      ->execute()
      ->single();
    $public = !empty($afform['is_public']);
    $parent = Record::string(Record::array($afform, 'navigation'), 'parent') ?? '';
    if (!$public && $parent !== '' && \CRM_Core_Permission::check('access CiviCRM')) {
      self::breadcrumbFromNavigation($parent);
    }
    $title = strip_tags(Record::string($afform, 'title') ?? '');
    if ($title !== '' && !$public) {
      \CRM_Utils_System::appendBreadCrumb([
        ['title' => $title, 'url' => \CRM_Utils_System::url(FormPage::path($page)) . '#'],
      ]);
    }
    \CRM_Utils_System::setTitle($title === '' ? 'CiviCRM' : $title);
  }

  /**
   * A form in the navigation menu gets that menu's breadcrumb instead of the route's.
   */
  private static function breadcrumbFromNavigation(string $parent): void {
    $navParent = Navigation::get(checkPermissions: FALSE)
      ->addWhere('name', '=', $parent)
      ->addWhere('domain_id', '=', 'current_domain')
      ->execute()
      ->first();
    $url = Record::string($navParent, 'url') ?? '';
    if ($url === '') {
      return;
    }
    \CRM_Utils_System::resetBreadCrumb();
    \CRM_Utils_System::appendBreadCrumb([
      ['title' => E::ts('CiviCRM'), 'url' => (string) \Civi::url('current://civicrm', 'h')],
      ['title' => Record::string($navParent, 'label') ?? '', 'url' => (string) \Civi::url('current://' . $url, 'h')],
    ]);
  }

}
