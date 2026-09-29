<?php

declare(strict_types = 1);

namespace Civi\Api4\Action\Facade;

use Civi\Api4\Afform;
use Civi\Api4\Generic\AbstractAction;
use Civi\Api4\Generic\Result;
use Civi\API\Exception\UnauthorizedException;
use Civi\Facade\Afforms;
use Civi\Facade\LayoutCompiler;
use CRM_Facade_ExtensionUtil as E;

/**
 * Returns an Afform with its layout as the Angular runtime would see it.
 *
 * @see \Civi\Facade\LayoutCompiler
 *
 * @method $this setName(string $name)
 * @method string getName()
 */
class GetForm extends AbstractAction {

  /**
   * Afform name.
   *
   * @var string
   * @required
   */
  protected $name;

  public function _run(Result $result): void {
    // Afform.get with permission checks drops forms the user may not open.
    $afform = Afform::get($this->getCheckPermissions())
      ->addWhere('name', '=', $this->name)
      ->addSelect('name', 'title', 'type', 'module_name')
      ->execute()
      ->first();
    if ($afform === NULL) {
      throw new UnauthorizedException(E::ts('Form "%1" does not exist or you may not open it.', [1 => $this->name]));
    }
    $afform['layout'] = self::layout(Afforms::field($afform, 'module_name'));
    $result[] = $afform;
  }

  /**
   * @return array<mixed>
   */
  private static function layout(string $module): array {
    return Afforms::cached(
      "layout_{$module}",
      static fn (): array => (new LayoutCompiler(Afforms::angular(), Afforms::blocks()))->compile($module),
    );
  }

}
