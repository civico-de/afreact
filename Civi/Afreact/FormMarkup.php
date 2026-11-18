<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Afform\StringVisitor;
use Civi\Angular\ChangeSet;
use Civi\Angular\Manager;

/**
 * An Afform module's partial after core's change sets, so every `af-field` carries the `defn`
 * that AfformMetadataInjector merged from the entity metadata.
 */
final class FormMarkup {

  public function __construct(private readonly Manager $angular) {}

  public function html(string $module): string {
    $partials = ChangeSet::applyResourceFilters(
      $this->changeSets($module),
      'partials',
      $this->angular->getRawPartials($module),
    );
    $html = is_array($partials) ? $partials["~/{$module}/{$module}.aff.html"] ?? NULL : NULL;
    if (!is_string($html)) {
      throw new \CRM_Core_Exception("No layout for Afform module {$module}.");
    }
    return $html;
  }

  /**
   * Core's change sets, with its markup translation swapped in place for FormStrings'.
   * deviation:form-strings-extension-domain
   *
   * @return list<ChangeSet>
   */
  private function changeSets(string $module): array {
    $translator = FormStrings::translator($this->angular->getModule($module)['_afform'] ?? NULL);
    $translate = ChangeSet::create('translate')->alterHtml(
      ';\.aff\.html$;',
      static fn (\phpQueryObject $doc) => (new StringVisitor())->visit($doc, $translator),
    );
    $sets = [];
    foreach ($this->angular->getChangeSets() as $set) {
      if (!$set instanceof ChangeSet) {
        throw new \CRM_Core_Exception('Angular returned a change set that is not a ChangeSet.');
      }
      $sets[] = $set->getName() === 'translate' ? $translate : $set;
    }
    return $sets;
  }

}
