<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use CRM_Afreact_ExtensionUtil as E;

/**
 * Route civicrm/admin/afreact: every form with what the React renderer cannot show yet.
 */
final class SupportPage {

  public static function render(): string {
    \CRM_Utils_System::setTitle(E::ts('React renderer support'));
    Assets::load();
    return Chrome::page(sprintf(
      '<div id="bootstrap-theme" class="afreact-support-page"><afreact-support listed="%s" settings="%s"></afreact-support></div>',
      Chrome::escape(json_encode(Takeover::forms(), JSON_THROW_ON_ERROR)),
      Chrome::escape((string) \Civi::url('current://civicrm/admin/setting/afreact?reset=1')),
    ));
  }

}
