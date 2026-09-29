<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Core\Event\GenericHookEvent;
use Civi\Core\Service\AutoSubscriber;

/**
 * The page (`server_route`) of a listed form: its route runs core's bare page class, and this
 * gives it the React template and, as CRM_Afform_Page_AfformBase does, title and breadcrumb.
 * No Angular module is loaded.
 */
final class FormPage extends AutoSubscriber {

  public const CALLBACK = 'CRM_Core_Page';

  public const TEMPLATE = 'afreact/AfformPage.tpl';

  public static function getSubscribedEvents(): array {
    return [
      'hook_civicrm_alterMenu' => ['onAlterMenu', Takeover::AFTER_CORE],
      'hook_civicrm_alterTemplateFile' => ['onAlterTemplateFile', Takeover::AFTER_CORE],
    ];
  }

  public static function onAlterMenu(GenericHookEvent $e): void {
    $forms = array_flip(Takeover::forms());
    $items = &$e->items;
    if (!is_array($items)) {
      return;
    }
    foreach ($items as &$item) {
      if (!is_array($item) || !isset($forms[self::form($item, 'CRM_Afform_Page_AfformBase') ?? ''])) {
        continue;
      }
      $item['page_callback'] = self::CALLBACK;
    }
  }

  public static function onAlterTemplateFile(GenericHookEvent $e): void {
    $page = $e->form;
    if ($e->context !== 'page' || !$page instanceof \CRM_Core_Page) {
      return;
    }
    $name = self::formName($page);
    if ($name !== NULL) {
      FormPageTitle::apply($page, $name);
      $page->assign('afreactName', $name);
      Assets::load();
      $e->tplName = self::TEMPLATE;
    }
  }

  /**
   * The form a bare core page was routed to by onAlterMenu, or NULL for any other page.
   */
  public static function formName(\CRM_Core_Page $page): ?string {
    return get_class($page) === \CRM_Core_Page::class
      ? self::form(\CRM_Core_Menu::get(self::path($page)), self::CALLBACK)
      : NULL;
  }

  /**
   * The form of an Afform route (`afform=<name>` in its page arguments) whose menu item runs `$callback`.
   */
  public static function form(mixed $item, string $callback): ?string {
    if (Record::string($item, 'page_callback') !== $callback) {
      return NULL;
    }
    parse_str(Record::string($item, 'page_arguments') ?? '', $args);
    return Record::string($args, 'afform');
  }

  public static function path(\CRM_Core_Page $page): string {
    return implode('/', array_filter($page->urlPath, 'is_string'));
  }

}
