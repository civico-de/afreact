<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Angular\ChangeSet;
use Civi\Angular\Manager;

/**
 * Turns an Afform module into its layout as the Angular runtime would see it.
 *
 * The partial runs through core's change sets, so every `af-field` carries the
 * `defn` that AfformMetadataInjector merged from the entity metadata. Block
 * elements get their own compiled layout as children, and embedded search
 * displays carry their settings as an array.
 */
final class LayoutCompiler {

  /**
   * @param array<string, string> $blocks
   *   Block directive name => Angular module name.
   */
  public function __construct(
    private readonly Manager $angular,
    private readonly array $blocks,
  ) {}

  /**
   * @param list<string> $trail
   *   Modules already being compiled, to stop recursive blocks.
   * @return array<mixed>
   */
  public function compile(string $module, array $trail = []): array {
    if (in_array($module, $trail, TRUE)) {
      throw new \CRM_Core_Exception("Afform block {$module} includes itself.");
    }
    $layout = (new \CRM_Afform_ArrayHtml())->convertHtmlToArray($this->html($module));
    return $this->prepareNodes($layout, [...$trail, $module]);
  }

  private function html(string $module): string {
    // afformAdmin injects Angular-only edit menus whose permission check runs client-side.
    $changeSets = array_filter(
      $this->angular->getChangeSets(),
      static fn (mixed $set) => !$set instanceof ChangeSet || $set->getName() !== 'afformAdmin',
    );
    $partials = ChangeSet::applyResourceFilters($changeSets, 'partials', $this->angular->getRawPartials($module));
    $html = is_array($partials) ? $partials["~/{$module}/{$module}.aff.html"] ?? NULL : NULL;
    if (!is_string($html)) {
      throw new \CRM_Core_Exception("No layout for Afform module {$module}.");
    }
    return $html;
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
