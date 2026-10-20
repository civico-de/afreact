<?php

declare(strict_types = 1);

// The card and widget options' templates; afCheckout requires this module for them, as for afStripe.
return [
  'js' => ['ang/afreactCheckout.js', 'ang/afreactCheckout/*.js'],
  'partials' => ['ang/afreactCheckout'],
  'requires' => ['afCheckout'],
  'basePages' => [],
];
