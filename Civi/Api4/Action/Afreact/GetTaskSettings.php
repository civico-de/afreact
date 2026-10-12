<?php

declare(strict_types = 1);

namespace Civi\Api4\Action\Afreact;

use Civi\Afreact\Afforms;
use Civi\Api4\Generic\AbstractAction;
use Civi\Api4\Generic\Result;
use CRM_Afreact_ExtensionUtil as E;

/**
 * What a bulk action's Angular module gets from its settingsFactory, for React's own dialog.
 *
 * @method $this setModule(string $module)
 * @method string getModule()
 */
class GetTaskSettings extends AbstractAction {

  /**
   * Modules whose settings React's task dialogs read; core builds them for every visitor.
   */
  public const MODULES = ['crmMsgadmTasks'];

  /**
   * Angular module name.
   *
   * @var string
   * @required
   */
  protected $module;

  public function _run(Result $result): void {
    if (!in_array($this->module, self::MODULES, TRUE)) {
      throw new \CRM_Core_Exception(E::ts('No task settings for module "%1".', [1 => $this->module]));
    }
    $definition = Afforms::angular()->getModules()[$this->module] ?? NULL;
    $factory = is_array($definition) ? $definition['settingsFactory'] ?? NULL : NULL;
    if (!is_callable($factory)) {
      throw new \CRM_Core_Exception(E::ts('Module "%1" is not enabled.', [1 => $this->module]));
    }
    $result[] = $factory();
  }

}
