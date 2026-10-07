<?php

declare(strict_types = 1);

// Contributions through forms: core's donation form shows its checkout block only with this on.
\Civi::settings()->set('contribute_enable_afform_contributions', value: TRUE);
