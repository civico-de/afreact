<?php

declare(strict_types = 1);

namespace Civi\AfreactCheckout;

use Civi\Checkout\CheckoutSession;

/**
 * Card fields in the processor's own template (as PayflowPro's): the details reach the server in
 * checkout_params, and the confirmation names what arrived.
 */
class CardOption extends DemoOption {

  public function getLabel(): string {
    return 'Demo card';
  }

  public function getAfformModule(): ?string {
    return 'afreactCheckout';
  }

  public function getAfformSettings(bool $testMode): array {
    return [
      'description' => 'Card details for the demo; nothing is charged.',
      'template' => '~/afreactCheckout/card.html',
      'cardTypeOptions' => [
        ['id' => 'Visa', 'label' => 'Visa'],
        ['id' => 'MasterCard', 'label' => 'MasterCard'],
      ],
    ];
  }

  public function startCheckout(CheckoutSession $session): void {
    $params = $session->getCheckoutParams();
    $expiry = is_array($params['credit_card_exp_date'] ?? NULL) ? $params['credit_card_exp_date'] : [];
    $session->setSuccessMessage(htmlspecialchars(sprintf(
      'Card %s ending %s, expiring %s/%s, accepted.',
      (string) ($params['credit_card_type'] ?? '?'),
      substr((string) ($params['credit_card_number'] ?? ''), -4),
      (string) ($expiry['M'] ?? '?'),
      (string) ($expiry['Y'] ?? '?'),
    )));
    $session->success();
  }

}
