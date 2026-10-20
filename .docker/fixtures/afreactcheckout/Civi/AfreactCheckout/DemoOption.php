<?php

declare(strict_types = 1);

namespace Civi\AfreactCheckout;

use Civi\Afform\Event\AfformValidateEvent;
use Civi\Checkout\AfformCheckoutOptionInterface;
use Civi\Checkout\CheckoutOption;

/**
 * A checkout option whose Angular template does the work, as a payment processor's would; its
 * checkout runs on this server only and moves no money.
 */
abstract class DemoOption extends CheckoutOption implements AfformCheckoutOptionInterface {

  public function validate(AfformValidateEvent $event): void {
  }

}
