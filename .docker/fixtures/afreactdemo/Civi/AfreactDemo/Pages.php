<?php

declare(strict_types = 1);

namespace Civi\AfreactDemo;

use Civi\Afreact\Assets;
use Civi\Afreact\Chrome;

/**
 * Route callbacks for the demo pages.
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
    \CRM_Utils_System::setTitle('Afreact demo (React)');
    Assets::load();
    Assets::layouts($source, self::FORMS);
    return Chrome::page(self::demo(
      'react',
      '<afreact-form name="afformAfreactDemoContact" source="' . $source . '"></afreact-form>',
      '<afreact-form name="afsearchAfreactDemoContacts" source="' . $source . '"></afreact-form>',
    ));
  }

  /**
   * Route civicrm/afreact/angular.
   */
  public static function angular(): string {
    \CRM_Utils_System::setTitle('Afreact demo (Angular)');
    Chrome::angular()->addModules(self::FORMS);
    $demo = self::demo(
      'angular',
      // As core's AfformBase.tpl: the form element gives Enter its implicit submit.
      '<form><afform-afreact-demo-contact></afform-afreact-demo-contact></form>',
      '<afsearch-afreact-demo-contacts></afsearch-afreact-demo-contacts>',
    );
    return Chrome::page('<crm-angular-js modules="' . implode(' ', self::FORMS) . '">' . $demo . '</crm-angular-js>');
  }

  private static function demo(string $renderer, string $form, string $search): string {
    return (
      '<div id="bootstrap-theme" class="afreact-demo" data-renderer="'
      . $renderer
      . '">'
      . '<section aria-labelledby="afreact-demo-form"><h2 id="afreact-demo-form">'
      . 'Contact form'
      . '</h2>'
      . $form
      . '</section>'
      . '<section aria-labelledby="afreact-demo-search"><h2 id="afreact-demo-search">'
      . 'Contacts'
      . '</h2>'
      . $search
      . '</section>'
      . '</div>'
    );
  }

}
