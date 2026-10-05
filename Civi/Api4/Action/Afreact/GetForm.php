<?php

declare(strict_types = 1);

namespace Civi\Api4\Action\Afreact;

use Civi\Afreact\Afforms;
use Civi\Afreact\LayoutCompiler;
use Civi\Api4\Afform;
use Civi\Api4\Generic\AbstractAction;
use Civi\Api4\Generic\Result;
use Civi\API\Exception\UnauthorizedException;
use CRM_Afreact_ExtensionUtil as E;

/**
 * Returns an Afform with its layout as the Angular runtime would see it.
 *
 * @see \Civi\Afreact\LayoutCompiler
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
      ->addSelect('name', 'title', 'type', 'autosave_draft', 'module_name')
      ->execute()
      ->first();
    if ($afform === NULL) {
      throw new UnauthorizedException(E::ts('Form "%1" does not exist or you may not open it.', [1 => $this->name]));
    }
    // Unset on forms saved before the option existed.
    $afform['autosave_draft'] = !empty($afform['autosave_draft']);
    $module = Afforms::field($afform, 'module_name');
    $afform['strings'] = Afforms::cached("strings_{$module}", static fn (): array => Afforms::translatedStrings(
      $module,
    ));
    $afform['layout'] = self::layout($module, $afform['strings']);
    $result[] = $afform;
  }

  /**
   * @param array<string, string> $strings
   * @return array<mixed>
   */
  private static function layout(string $module, array $strings): array {
    return Afforms::cached(
      "layout_{$module}",
      static fn (): array => (new LayoutCompiler(Afforms::angular(), Afforms::blocks(), $strings))->compile($module),
    );
  }

}
