<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * CRM_Afform_ArrayHtml, reading JS attributes as Angular evaluates them in the form's scope:
 * `ts('…')` with a string literal is that text, translated, where core's decoding gives null.
 */
final class LayoutHtml extends \CRM_Afform_ArrayHtml {

  private const TS_CALL = '/^ts\(\s*(\'(?:[^\'\\\\]|\\\\.)*\'|"(?:[^"\\\\]|\\\\.)*")\s*\)$/s';

  /**
   * @param array<string, string> $strings
   *   The form's translated strings (Angular's module strings).
   */
  public function __construct(
    private readonly array $strings,
  ) {
    parent::__construct();
  }

  /**
   * @param string $type
   * @param string $txtAttrValue
   * @return mixed
   */
  protected function decodeAttrValue($type, $txtAttrValue) {
    return $type === 'js' ? $this->decodeJs($txtAttrValue) : parent::decodeAttrValue($type, $txtAttrValue);
  }

  private function decodeJs(string $js): mixed {
    $js = trim($js);
    if (preg_match(self::TS_CALL, $js, $match)) {
      $text = \CRM_Utils_JS::decode($match[1]);
      return is_string($text) ? $this->strings[$text] ?? ts($text) : NULL;
    }
    $first = substr($js, 0, 1);
    $last = substr($js, -1);
    if ($first === '{' && $last === '}' || $first === '[' && $last === ']') {
      return array_map(fn (string $item): mixed => $this->decodeJs($item), \CRM_Utils_JS::getRawProps($js));
    }
    return \CRM_Utils_JS::decode($js);
  }

}
