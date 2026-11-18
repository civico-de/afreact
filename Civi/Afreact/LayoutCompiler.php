<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Afform\StringVisitor;
use Civi\Angular\ChangeSet;
use Civi\Angular\Manager;
use Civi\Api4\SearchDisplay;

/**
 * Turns an Afform module into its layout as the Angular runtime would see it.
 *
 * The partial runs through core's change sets, so every `af-field` carries the
 * `defn` that AfformMetadataInjector merged from the entity metadata. Block
 * elements get their own compiled layout as children, and embedded search
 * displays carry their settings as an array. `ts('…')` in JS attributes is
 * translated with the form's strings (LayoutHtml).
 */
final class LayoutCompiler {

  /**
   * @param array<string, string> $blocks
   *   Block directive name => Angular module name.
   * @param array<string, string> $strings
   *   The form's translated strings, blocks included.
   */
  public function __construct(
    private readonly Manager $angular,
    private readonly array $blocks,
    private readonly array $strings,
  ) {}

  /**
   * @param list<string> $trail
   *   Modules already being compiled, to stop recursive blocks.
   * @return array<mixed>
   */
  public function compile(string $module, array $trail = []): array {
    // deviation:self-including-block-rejected
    if (in_array($module, $trail, TRUE)) {
      throw new \CRM_Core_Exception("Afform block {$module} includes itself.");
    }
    $layout = (new LayoutHtml($this->strings))->convertHtmlToArray($this->html($module));
    return $this->prepareNodes($layout, [...$trail, $module]);
  }

  private function html(string $module): string {
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
   * Core's change sets, with its markup translation swapped in place for one in the domain of
   * the extension that ships the form. deviation:form-strings-extension-domain
   *
   * @return list<ChangeSet>
   */
  private function changeSets(string $module): array {
    $domain = Afforms::domain($this->angular->getModule($module)['_afform'] ?? NULL);
    $translate = ChangeSet::create('translate')->alterHtml(
      ';\.aff\.html$;',
      fn (\phpQueryObject $doc) => (new StringVisitor())->visit($doc, fn (string $text) => _ts($text, [
        'domain' => $domain,
      ])),
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

  /**
   * The label of an embedded display, which names its table or list. deviation:form-display-named
   */
  private static function displayLabel(mixed $search, mixed $display): string {
    if (!is_string($search) || $search === '') {
      return '';
    }
    $found = is_string($display) && $display !== ''
      ? SearchDisplay::get(FALSE)
        ->addSelect('label')
        ->addWhere('name', '=', $display)
        ->addWhere('saved_search_id.name', '=', $search)
        ->execute()
        ->first()
      : SearchDisplay::getDefault(FALSE)->setSavedSearch($search)->addSelect('label')->execute()->first();
    $label = is_array($found) ? $found['label'] ?? NULL : NULL;
    return is_string($label) ? $label : '';
  }

  /**
   * @param array<mixed> $nodes
   *   ArrayHtml nodes; elements are arrays with a `#tag`.
   * @param list<string> $trail
   * @return array<mixed>
   */
  private function prepareNodes(array $nodes, array $trail): array {
    foreach ($nodes as &$node) {
      if (!is_array($node) || !isset($node['#tag']) || !is_string($node['#tag'])) {
        continue;
      }
      $node = $this->prepareElement($node['#tag'], $node, $trail);
    }
    return $nodes;
  }

  /**
   * @param array<mixed> $node
   * @param list<string> $trail
   * @return array<mixed>
   */
  private function prepareElement(string $tag, array $node, array $trail): array {
    // Afform injects display settings as a JS literal the client cannot parse.
    if (str_starts_with($tag, 'crm-search-display-') && isset($node['settings']) && is_string($node['settings'])) {
      $node['settings'] = \CRM_Utils_JS::decode($node['settings']);
      $node['display-label'] = self::displayLabel($node['search-name'] ?? NULL, $node['display-name'] ?? NULL);
    }
    if (isset($this->blocks[$tag])) {
      $node['#children'] = $this->compile($this->blocks[$tag], $trail);
      return $node;
    }
    if (isset($node['#children']) && is_array($node['#children'])) {
      $node['#children'] = $this->prepareNodes($node['#children'], $trail);
    }
    return $node;
  }

}
