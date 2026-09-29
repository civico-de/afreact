<?php

declare(strict_types = 1);

// phpcs:disable PSR1.Files.SideEffects
require_once 'facade.civix.php';
// phpcs:enable

/**
 * Implements hook_civicrm_config().
 *
 * @link https://docs.civicrm.org/dev/en/latest/hooks/hook_civicrm_config/
 */
function facade_civicrm_config(\CRM_Core_Config $config): void {
  _facade_civix_civicrm_config($config);
}

/**
 * Implements hook_civicrm_install().
 *
 * @link https://docs.civicrm.org/dev/en/latest/hooks/hook_civicrm_install
 */
function facade_civicrm_install(): void {
  _facade_civix_civicrm_install();
}

/**
 * Implements hook_civicrm_enable().
 *
 * @link https://docs.civicrm.org/dev/en/latest/hooks/hook_civicrm_enable
 */
function facade_civicrm_enable(): void {
  _facade_civix_civicrm_enable();
}
