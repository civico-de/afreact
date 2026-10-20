<?php

declare(strict_types = 1);

namespace Civi\AfreactDemo\Page;

use Civi\Afreact\Kit;

/**
 * Route civicrm/afreact/kit-only: the kit's consumer without afreact's own bundle, as a page of
 * its own or as a snippet that civicrm/afreact/kit-host loads.
 */
final class KitOnly extends \CRM_Core_Page {

  public function run(): void {
    \CRM_Utils_System::setTitle('Afreact kit only');
    Kit::load();
    \Civi::resources()->addModuleFile('afreactdemo', 'js/kit-consumer.js');
    parent::run();
  }

}
