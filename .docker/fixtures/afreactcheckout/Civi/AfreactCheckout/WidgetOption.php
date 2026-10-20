<?php

declare(strict_types = 1);

namespace Civi\AfreactCheckout;

use Civi\Checkout\CheckoutSession;

/**
 * A payment widget mounted after the submit (as Stripe's embedded checkout): the response carries
 * its secret and no message, and the template replaces the form with the widget.
 */
class WidgetOption extends DemoOption {

  public function getLabel(): string {
    return 'Demo widget';
  }

  public function getAfformModule(): ?string {
    return 'afreactCheckout';
  }

  public function getAfformSettings(bool $testMode): array {
    return [
      'template' => '~/afreactCheckout/widget.html',
      'public_key' => 'demo_public_key',
    ];
  }

  public function startCheckout(CheckoutSession $session): void {
    $session->setResponseItem('afreactcheckout_widget', [
      'client_secret' => 'demo_secret_' . $session->getContributionId(),
    ]);
    $session->setResponseItem('message', FALSE);
    $session->pending();
  }

}
