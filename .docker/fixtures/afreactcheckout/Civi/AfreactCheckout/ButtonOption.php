<?php

declare(strict_types = 1);

namespace Civi\AfreactCheckout;

use Civi\Checkout\CheckoutSession;

/**
 * A wallet button in place of the form's submit button (as PayPal's): it submits the form itself
 * and finishes with the order the response hands it, so the form shows no message of its own.
 */
class ButtonOption extends DemoOption {

  public function getLabel(): string {
    return 'Demo wallet';
  }

  public function getAfformModule(): ?string {
    return 'afreactCheckoutButton';
  }

  public function getAfformSettings(bool $testMode): array {
    return [
      'template' => '~/afreactCheckoutButton/button.html',
      'wallet' => 'Demo Wallet',
    ];
  }

  public function startCheckout(CheckoutSession $session): void {
    $session->setResponseItem('afreactcheckout_button', [
      'order' => 'DEMO-' . $session->getContributionId(),
      'source' => (string) ($session->getCheckoutParams()['payment_source_type'] ?? ''),
    ]);
    $session->setResponseItem('message', FALSE);
    $session->setResponseItem('redirect', FALSE);
    $session->pending();
  }

}
