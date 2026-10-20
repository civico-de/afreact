<?php

declare(strict_types = 1);

// The wallet option's template; it needs no afCheckout, as afPaypal.
return [
  'js' => ['ang/afreactCheckoutButton.js', 'ang/afreactCheckoutButton/*.js'],
  'partials' => ['ang/afreactCheckoutButton'],
  'requires' => ['crmUi', 'crmUtil', 'ngRoute'],
  'basePages' => [],
];
