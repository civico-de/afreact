<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Angular\AngularLoader;

/**
 * What the afreact route callbacks share: CiviCRM's page chrome, escaping and the Angular loader.
 */
final class Chrome {

  /**
   * A route returning a bare string is printed without CiviCRM's page chrome;
   * the content template adds it, as CRM_Core_Page::run() would.
   */
  public static function page(string $content): string {
    $page = \CRM_Core_Smarty::singleton()->fetchWith(\CRM_Utils_System::getContentTemplate(), [
      'afreactContent' => $content,
      'tplFile' => 'string:{$afreactContent nofilter}',
    ]);
    if (!is_string($page)) {
      throw new \CRM_Core_Exception('CiviCRM did not render its content template.');
    }
    return $page;
  }

  public static function escape(string $text): string {
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
  }

  public static function angular(): AngularLoader {
    $loader = \Civi::service('angularjs.loader');
    if (!$loader instanceof AngularLoader) {
      throw new \CRM_Core_Exception('The Angular loader service is not available.');
    }
    return $loader;
  }

}
