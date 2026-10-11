<?php

declare(strict_types = 1);

require_once 'afreact.civix.php';

/**
 * Implements hook_civicrm_config().
 *
 * @link https://docs.civicrm.org/dev/en/latest/hooks/hook_civicrm_config/
 */
function afreact_civicrm_config(\CRM_Core_Config $config): void {
  _afreact_civix_civicrm_config($config);
}

/**
 * Implements hook_civicrm_install().
 *
 * @link https://docs.civicrm.org/dev/en/latest/hooks/hook_civicrm_install
 */
function afreact_civicrm_install(): void {
  _afreact_civix_civicrm_install();
}

/**
 * Implements hook_civicrm_enable().
 *
 * @link https://docs.civicrm.org/dev/en/latest/hooks/hook_civicrm_enable
 */
function afreact_civicrm_enable(): void {
  _afreact_civix_civicrm_enable();
}
