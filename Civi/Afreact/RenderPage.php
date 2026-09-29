<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use Civi\API\Exception\UnauthorizedException;
use CRM_Afreact_ExtensionUtil as E;

/**
 * Route civicrm/afreact/render: any form the user may open, with either renderer, for
 * side-by-side checks of core's own forms.
 */
final class RenderPage {

  /**
   * Route civicrm/afreact/render: one form with the renderer `?renderer=react|angular` names.
   */
  public static function render(): string {
    $name = \CRM_Utils_Request::retrieveValue('name', 'String', method: 'GET');
    $renderer = \CRM_Utils_Request::retrieveValue('renderer', 'String', method: 'GET');
    if (!is_string($name) || !in_array($renderer, ['react', 'angular'], TRUE)) {
      throw new \CRM_Core_Exception('The page needs a form name and renderer=react or renderer=angular.');
    }
    return self::renderWith($name, $renderer);
  }

  public static function renderWith(string $name, string $renderer): string {
    // Afform.get with permission checks drops forms the user may not open.
    $form = Afform::get()
      ->addWhere('name', '=', $name)
      ->addSelect('title', 'module_name', 'directive_name')
      ->execute()
      ->first();
    if ($form === NULL) {
      throw new UnauthorizedException(E::ts('Form "%1" does not exist or you may not open it.', [1 => $name]));
    }
    $title = is_string($form['title'] ?? NULL) ? $form['title'] : $name;
    \CRM_Utils_System::setTitle($title);
    if ($renderer === 'react') {
      Assets::load();
      return Chrome::page(self::single('react', '<afreact-form name="' . Chrome::escape($name) . '"></afreact-form>'));
    }
    $module = Afforms::field($form, 'module_name');
    $directive = Afforms::field($form, 'directive_name');
    if (preg_match('/^[a-z][a-z0-9-]*$/', $directive) !== 1) {
      throw new \CRM_Core_Exception("Form \"{$name}\" has no usable directive name.");
    }
    Chrome::angular()->addModules([$module]);
    // As core's AfformBase.tpl: the form element gives Enter its implicit submit.
    $element = "<form><{$directive}></{$directive}></form>";
    return Chrome::page(
      '<crm-angular-js modules="'
      . Chrome::escape($module)
      . '">'
      . self::single('angular', $element)
      . '</crm-angular-js>',
    );
  }

  private static function single(string $renderer, string $form): string {
    return '<div id="bootstrap-theme" class="afreact-render" data-renderer="' . $renderer . '">' . $form . '</div>';
  }

}
