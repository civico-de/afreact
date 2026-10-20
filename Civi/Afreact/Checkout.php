<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * What CheckoutBlock fields need from civi_contribute's checkout: afCheckout's settings and, for
 * options with an Angular template, what the option's island loads once it is chosen.
 */
final class Checkout {

  /**
   * CRM.vars.afreact.afCheckout, as afCheckout's settingsFactory gives CRM.afCheckout, while
   * afform contributions are on.
   */
  public static function addVars(): void {
    $checkout = \Civi::container()->has('civi.checkout.afform') ? \Civi::service('civi.checkout.afform') : NULL;
    if ($checkout instanceof \Civi\Checkout\Afform && $checkout->isActive()) {
      \Civi::resources()
        ->addStyleFile('civi_contribute', 'ang/afCheckout.css')
        // Asked once per request: Assets::load() runs once per element on a page.
        ->addVars('afreact', ['afCheckout' => \Civi::$statics[self::class] ??= self::settings()]);
    }
  }

  /**
   * @return array<mixed>
   */
  private static function settings(): array {
    $settings = \Civi\Checkout\Afform::getSettings();
    $templated = array_keys(array_filter(
      Record::array($settings, 'checkoutOptions'),
      static fn (mixed $option): bool => is_array($option) && !empty($option['template']),
    ));
    if ($templated) {
      $settings['islands'] = self::islands(array_map(strval(...), $templated));
    }
    return $settings;
  }

  /**
   * The templated options and what their islands load: afCore, afCheckout and the options' modules.
   *
   * @param list<string> $keys
   * @return array<string, mixed>
   */
  private static function islands(array $keys): array {
    $checkout = \Civi::service('civi.checkout');
    if (!$checkout instanceof \Civi\Checkout) {
      throw new \CRM_Core_Exception('The civi.checkout service is not available.');
    }
    $options = [];
    foreach ($keys as $key) {
      $option = $checkout->getOption($key);
      $options[$key] = [
        'label' => $option->getLabel(),
        'module' => $option instanceof \Civi\Checkout\AfformCheckoutOptionInterface ? $option->getAfformModule() : NULL,
      ];
    }
    $roots = array_values(array_unique(['afCore', 'afCheckout', ...array_filter(array_column($options, 'module'))]));
    return ['modules' => $roots, 'options' => $options, 'assets' => AngularAssets::of($roots)];
  }

}
