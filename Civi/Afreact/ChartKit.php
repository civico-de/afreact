<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * What the chart display needs from the chart_kit extension.
 */
final class ChartKit {

  /**
   * Per snippet type: the list its URLs join and the key that holds them.
   */
  private const URL_KEYS = [
    'scriptUrl' => ['scripts', 'scriptUrl'],
    'scriptFile' => ['scripts', 'scriptFileUrls'],
    'styleUrl' => ['styles', 'styleUrl'],
    'styleFile' => ['styles', 'styleFileUrls'],
  ];

  /**
   * CRM.vars.afreact.chartKit, while chart_kit is enabled: its assets, or why they cannot load.
   */
  public static function addVars(): void {
    if (!\CRM_Extension_System::singleton()->getMapper()->isActiveModule('chart_kit')) {
      return;
    }
    try {
      $chartKit = self::assets();
    }
    catch (\CRM_Core_Exception $e) {
      // Only the charts show it: the rest of the page does not need chart_kit.
      $chartKit = ['error' => $e->getMessage()];
    }
    \Civi::resources()->addVars('afreact', ['chartKit' => $chartKit]);
  }

  /**
   * The URLs of chart_kit's bundle, which the chart display loads only when a chart renders: d3 and
   * dc weigh more than the renderer. The bundle's translations go on the page right away.
   *
   * @return array{scripts: list<string>, styles: list<string>}
   */
  private static function assets(): array {
    $bundle = \Civi::service('bundle.chart_kit');
    if (!$bundle instanceof \CRM_Core_Resources_Bundle) {
      throw new \CRM_Core_Exception('The bundle.chart_kit service is no resource bundle.');
    }
    $snippets = [];
    foreach ($bundle->getAll() as $snippet) {
      $snippets[] = (array) $snippet;
    }
    // The bundle fills type, weight and disabled into every snippet it adds.
    usort($snippets, static fn (array $a, array $b): int => $a['weight'] <=> $b['weight']);
    $assets = [
      'scripts' => [],
      'styles' => [self::url(\Civi::resources()->getUrl('chart_kit', 'ang/crmChartKit.css', TRUE))],
    ];
    foreach ($snippets as $snippet) {
      $type = is_string($snippet['type']) ? $snippet['type'] : '';
      if ($snippet['disabled']) {
        continue;
      }
      if (!empty($snippet['esm'])) {
        throw new \CRM_Core_Exception('chart_kit\'s bundle has an ES module the renderer cannot load.');
      }
      if ($type === 'settings') {
        \Civi::resources()->addSetting((array) $snippet['settings']);
        continue;
      }
      [$list, $key] = self::URL_KEYS[$type] ?? throw new \CRM_Core_Exception(
        'chart_kit\'s bundle has a resource the renderer cannot load: ' . json_encode($type),
      );
      array_push($assets[$list], ...array_map(self::url(...), (array) ($snippet[$key] ?? NULL)));
    }
    return $assets;
  }

  private static function url(mixed $url): string {
    if (!is_string($url) || $url === '') {
      throw new \CRM_Core_Exception('chart_kit\'s bundle has a resource without a URL.');
    }
    return $url;
  }

}
