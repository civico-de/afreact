<?php

declare(strict_types = 1);

namespace Civi\Api4;

/**
 * Read-only actions that hand core definitions to the React renderer.
 *
 * @package Civi\Api4
 */
class Afreact extends Generic\AbstractEntity {

  public static function getFields(bool $checkPermissions = TRUE): Generic\BasicGetFieldsAction {
    return (new Generic\BasicGetFieldsAction(
      static::getEntityName(),
      __FUNCTION__,
      static fn () => [],
    ))->setCheckPermissions($checkPermissions);
  }

  /**
   * A form's layout with field metadata resolved and blocks inlined.
   */
  public static function getForm(bool $checkPermissions = TRUE): Action\Afreact\GetForm {
    return (new Action\Afreact\GetForm(static::getEntityName(), __FUNCTION__))
      ->setCheckPermissions($checkPermissions);
  }

  /**
   * The settings of a bulk action's Angular module, for the renderer's own dialog.
   */
  public static function getTaskSettings(bool $checkPermissions = TRUE): Action\Afreact\GetTaskSettings {
    return (new Action\Afreact\GetTaskSettings(static::getEntityName(), __FUNCTION__))
      ->setCheckPermissions($checkPermissions);
  }

  /**
   * @return array<mixed>
   */
  public static function permissions(): array {
    // Access to a form is the form's own permission, enforced by Afform.get in the action.
    // Task settings are what core's factories give anyone who loads the module.
    return ['getForm' => [], 'getTaskSettings' => ['access CiviCRM']] + parent::permissions();
  }

}
