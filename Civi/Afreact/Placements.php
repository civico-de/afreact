<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Core\Event\GenericHookEvent;
use Civi\Core\Service\AutoSubscriber;

/**
 * Tabs and ContactLayout blocks core placed for listed forms include the React template.
 */
final class Placements extends AutoSubscriber {

  public static function getSubscribedEvents(): array {
    return [
      'hook_civicrm_tabset' => ['onTabset', Takeover::AFTER_CORE],
      'hook_civicrm_contactSummaryBlocks' => ['onContactSummaryBlocks', Takeover::AFTER_CORE],
    ];
  }

  /**
   * Contact summary and event management tabs.
   */
  public static function onTabset(GenericHookEvent $e): void {
    $modules = Takeover::modules();
    $tabs = self::swapTemplates(
      (array) $e->tabs,
      'template',
      static fn (array $tab): ?string => $modules[Record::string($tab, 'module') ?? ''] ?? NULL,
    );
    if ($tabs === NULL) {
      return;
    }
    $e->tabs = $tabs;
    // ContactLayout's editor asks for the tabs with a caller; it renders none.
    if (Record::string($e->context, 'caller') === NULL) {
      Assets::load();
    }
  }

  public static function onContactSummaryBlocks(GenericHookEvent $e): void {
    $forms = array_flip(Takeover::forms());
    $listed = static fn (array $block, int|string $name): ?string => isset($forms[$name]) ? (string) $name : NULL;
    $groups = (array) $e->blocks;
    foreach ($groups as $key => $group) {
      $blocks = self::swapTemplates(Record::array($group, 'blocks'), 'tpl_file', $listed);
      if ($blocks !== NULL) {
        $groups[$key] = ['blocks' => $blocks] + (array) $group;
      }
    }
    $e->blocks = $groups;
  }

  /**
   * The placements with afreact's template wherever core gave its inline one to a form `$formOf`
   * names, or NULL when there is none.
   *
   * @param array<mixed> $placements
   * @param callable(array<mixed>, int|string): ?string $formOf
   * @return array<mixed>|null
   */
  private static function swapTemplates(array $placements, string $templateKey, callable $formOf): ?array {
    $swapped = FALSE;
    foreach ($placements as $key => $placement) {
      $form = Record::string($placement, $templateKey) === Takeover::CORE_INLINE_TEMPLATE
        ? $formOf((array) $placement, $key)
        : NULL;
      if ($form !== NULL) {
        $placements[$key] = [$templateKey => Takeover::INLINE_TEMPLATE, 'afreact' => $form] + (array) $placement;
        $swapped = TRUE;
      }
    }
    return $swapped ? $placements : NULL;
  }

}
