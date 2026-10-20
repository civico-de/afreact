<?php

declare(strict_types = 1);

namespace Civi\AfreactDemo;

use Civi\Afreact\Assets;
use Civi\Afreact\Chrome;
use Civi\Afreact\Kit;

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

  /**
   * Route civicrm/afreact/kit: another extension's module built on the kit, beside an afreact form.
   */
  public static function kit(): string {
    \CRM_Utils_System::setTitle('Afreact kit consumer');
    Assets::load();
    Kit::load();
    \Civi::resources()->addModuleFile('afreactdemo', 'js/kit-consumer.js');
    return Chrome::page(
      '<div id="bootstrap-theme" class="afreact-kit-demo">'
      . '<section aria-labelledby="afreact-kit-form"><h2 id="afreact-kit-form">Contact form</h2>'
      . '<afreact-form name="afformAfreactDemoContact" source="api"></afreact-form></section>'
      . '<section id="afreact-kit-consumer" aria-labelledby="afreact-kit-consumer-title"><afreactdemo-segment></afreactdemo-segment></section>'
      . '</div>',
    );
  }

  /**
   * Route civicrm/afreact/kit-host: a page that loads the kit's consumer module and then
   * civicrm/afreact/kit-only as a snippet, as a tab or a popup brings one.
   */
  public static function kitHost(): string {
    \CRM_Utils_System::setTitle('Afreact kit host');
    Kit::load();
    \Civi::resources()
      ->addModuleFile('afreactdemo', 'js/kit-consumer.js')
      ->addScript(
        "CRM.\$(() => CRM.loadPage(CRM.url('civicrm/afreact/kit-only', {reset: 1}), {target: '#afreact-kit-host'}));",
      );
    return Chrome::page('<div id="afreact-kit-host"></div>');
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
