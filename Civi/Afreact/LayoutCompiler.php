<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Angular\Manager;

/**
 * Turns an Afform module into its layout as the Angular runtime would see it.
 *
 * The partial comes from FormMarkup, its `af-field`s carrying their `defn`. Block
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
    $layout = (new LayoutHtml($this->strings))->convertHtmlToArray((new FormMarkup($this->angular))->html($module));
    return $this->prepareNodes($layout, [...$trail, $module]);
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
    if (str_starts_with($tag, 'crm-search-display-')) {
      $node = EmbeddedDisplay::prepare($node);
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
