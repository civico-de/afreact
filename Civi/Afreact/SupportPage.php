<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\OptionValue;
use CRM_Afreact_ExtensionUtil as E;

/**
 * Route civicrm/admin/afreact: every form with what the React renderer cannot show yet, and per
 * builder what the React builder would hand to the classic one.
 */
final class SupportPage {

  public static function render(): string {
    \CRM_Utils_System::setTitle(E::ts('React renderer support'));
    // The builder's bundle and plugins, so the report asks the editors the builder has.
    AdminPage::load('search_kit');
    return Chrome::page(sprintf(
      '<div id="bootstrap-theme" class="afreact-support-page"><afreact-support listed="%s" settings="%s"></afreact-support><afreact-builders-report report="%s"></afreact-builders-report></div>',
      Chrome::escape(json_encode(Takeover::forms(), JSON_THROW_ON_ERROR)),
      Chrome::escape((string) \Civi::url('current://civicrm/admin/setting/afreact?reset=1')),
      Chrome::escape(json_encode(self::searchKit(), JSON_THROW_ON_ERROR)),
    ));
  }

  /**
   * @return array<string, mixed>
   *   The display types by stored value with their labels, and BuilderReport's findings.
   */
  public static function searchKit(): array {
    $types = OptionValue::get(checkPermissions: FALSE)
      ->addSelect('value', 'label')
      ->addWhere('option_group_id:name', '=', 'search_display_type')
      ->addWhere('is_active', '=', TRUE)
      ->addOrderBy('weight')
      ->execute()
      ->column('label', 'value');
    return ['displayTypes' => $types] + BuilderReport::check('search_kit');
  }

}
