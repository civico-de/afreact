<?php

declare(strict_types = 1);

use Civi\Core\Event\GenericHookEvent;

/**
 * Offers the fixture's checkout options; the ang-php mixin registers their Angular modules and
 * afform finds the donation form in ang/.
 */
function afreactcheckout_civicrm_config(): void {
  if (isset(\Civi::$statics[__FUNCTION__])) {
    return;
  }
  \Civi::$statics[__FUNCTION__] = TRUE;
  \Civi::dispatcher()->addListener('civi.checkout.options', static function (GenericHookEvent $event): void {
    $event->options = [
      ...((array) $event->options),
      'afreactcheckout_card' => new \Civi\AfreactCheckout\CardOption(),
      'afreactcheckout_button' => new \Civi\AfreactCheckout\ButtonOption(),
      'afreactcheckout_widget' => new \Civi\AfreactCheckout\WidgetOption(),
    ];
  });
}
