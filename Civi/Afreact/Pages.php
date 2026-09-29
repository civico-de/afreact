<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Angular\AngularLoader;
use CRM_Afreact_ExtensionUtil as E;

/**
 * Route callbacks for the demo and comparison pages.
 *
 * Both demo pages share one markup, so chrome and structure around the forms
 * are identical and only the elements that mount the forms differ.
 */
final class Pages {

  public const FORMS = ['afformAfreactDemoContact', 'afsearchAfreactDemoContacts'];

  /**
   * Route civicrm/afreact/demo; `?source=page|bundle` picks where the forms take their layout from.
   */
  public static function react(): string {
    $source = \CRM_Utils_Request::retrieveValue('source', 'String', 'api');
    return self::reactWith(is_string($source) ? $source : '');
  }

  public static function reactWith(string $source): string {
    if (!in_array($source, Assets::SOURCES, TRUE)) {
      throw new \CRM_Core_Exception("Unknown layout source \"{$source}\".");
    }
    \CRM_Utils_System::setTitle(E::ts('Afreact demo (React)'));
    Assets::load();
    Assets::layouts($source, self::FORMS);
    return self::inChrome(self::demo(
      'react',
      '<afreact-form name="afformAfreactDemoContact" source="' . $source . '"></afreact-form>',
      '<afreact-form name="afsearchAfreactDemoContacts" source="' . $source . '"></afreact-form>',
    ));
  }

  /**
   * Route civicrm/afreact/angular.
   */
  public static function angular(): string {
    \CRM_Utils_System::setTitle(E::ts('Afreact demo (Angular)'));
    $loader = \Civi::service('angularjs.loader');
    if (!$loader instanceof AngularLoader) {
      throw new \CRM_Core_Exception('The Angular loader service is not available.');
    }
    $loader->addModules(self::FORMS);
    $demo = self::demo(
      'angular',
      // As core's AfformBase.tpl: the form element gives Enter its implicit submit.
      '<form><afform-afreact-demo-contact></afform-afreact-demo-contact></form>',
      '<afsearch-afreact-demo-contacts></afsearch-afreact-demo-contacts>',
    );
    return self::inChrome('<crm-angular-js modules="' . implode(' ', self::FORMS) . '">' . $demo . '</crm-angular-js>');
  }

  /**
   * Route civicrm/afreact/compare.
   */
  public static function compare(): string {
    \CRM_Utils_System::setTitle(E::ts('Afreact: React vs Angular'));
    Assets::load();
    $demo = static fn (string $source): string => (string) \Civi::url(
      'current://civicrm/afreact/demo' . ($source === 'api' ? '' : "?source={$source}"),
    );
    $pages = [
      ['label' => E::ts('React, layout from API'), 'url' => $demo('api')],
      ['label' => E::ts('React, layout in page'), 'url' => $demo('page')],
      ['label' => E::ts('React, Angular module file'), 'url' => $demo('bundle')],
      ['label' => E::ts('Angular'), 'url' => (string) \Civi::url('current://civicrm/afreact/angular')],
    ];
    return self::inChrome(sprintf(
      '<afreact-compare pages="%s"></afreact-compare>',
      self::escape(json_encode($pages, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)),
    ));
  }

  private static function demo(string $renderer, string $form, string $search): string {
    return (
      '<div id="bootstrap-theme" class="afreact-demo" data-renderer="'
      . $renderer
      . '">'
      . '<section aria-labelledby="afreact-demo-form"><h2 id="afreact-demo-form">'
      . self::escape(E::ts('Contact form'))
      . '</h2>'
      . $form
      . '</section>'
      . '<section aria-labelledby="afreact-demo-search"><h2 id="afreact-demo-search">'
      . self::escape(E::ts('Contacts'))
      . '</h2>'
      . $search
      . '</section>'
      . '</div>'
    );
  }

  /**
   * A route returning a bare string is printed without CiviCRM's page chrome;
   * the content template adds it, as CRM_Core_Page::run() would.
   */
  private static function inChrome(string $content): string {
    $page = \CRM_Core_Smarty::singleton()->fetchWith(\CRM_Utils_System::getContentTemplate(), [
      'afreactContent' => $content,
      'tplFile' => 'string:{$afreactContent nofilter}',
    ]);
    if (!is_string($page)) {
      throw new \CRM_Core_Exception('CiviCRM did not render its content template.');
    }
    return $page;
  }

  private static function escape(string $text): string {
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
  }

}
