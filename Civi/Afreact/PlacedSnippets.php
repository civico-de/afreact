<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Core\Event\GenericHookEvent;
use Civi\Core\Service\AutoSubscriber;

/**
 * Contact and case summary blocks core added for listed forms get the React markup.
 */
final class PlacedSnippets extends AutoSubscriber {

  public static function getSubscribedEvents(): array {
    return [
      'hook_civicrm_pageRun' => ['onPageRun', Takeover::AFTER_CORE],
      'hook_civicrm_buildForm' => ['onBuildForm', Takeover::AFTER_CORE],
    ];
  }

  public static function onPageRun(GenericHookEvent $e): void {
    $page = $e->page;
    // As ContactSummaryBlockPlacement; the print view extends the summary.
    if (!$page instanceof \CRM_Contact_Page_View_Summary) {
      return;
    }
    $options = ['contact_id' => $page->get('cid')];
    foreach (['left', 'right'] as $side) {
      self::replace(
        "contact-basic-info-{$side}",
        static fn (string $name): string => (
          '<div class="crm-summary-block">' . self::inline($name, $options) . '</div>'
        ),
      );
    }
  }

  public static function onBuildForm(GenericHookEvent $e): void {
    $form = $e->form;
    if ($e->formName !== 'CRM_Case_Form_CaseView' || !$form instanceof \CRM_Core_Form) {
      return;
    }
    // As CaseSummaryBlockPlacement.
    $options = ['case_id' => $form->get('id'), 'contact_id' => $form->get('cid')];
    self::replace('case-view-custom-data-view', static fn (string $name): string => self::inline($name, $options));
  }

  /**
   * Core names each placed form's region snippet `afform:<name>`.
   *
   * @param callable(string): string $markup
   */
  private static function replace(string $region, callable $markup): void {
    $instance = \CRM_Core_Region::instance($region);
    foreach (Takeover::forms() as $name) {
      if ($instance->get("afform:{$name}") === NULL) {
        continue;
      }
      $instance->update("afform:{$name}", ['markup' => $markup($name)]);
      Assets::load();
    }
  }

  /**
   * @param array<string, mixed> $options
   */
  private static function inline(string $name, array $options): string {
    $html = \CRM_Core_Smarty::singleton()->fetchWith(Takeover::INLINE_TEMPLATE, [
      'block' => ['afreact' => $name],
      'afformOptions' => $options,
    ]);
    if (!is_string($html)) {
      throw new \CRM_Core_Exception('CiviCRM did not render the inline form template.');
    }
    return $html;
  }

}
