<?php

declare(strict_types = 1);

namespace Civi\Afreact;

/**
 * Translates a form's texts in the domain of the extension that ships it, then in core's.
 * deviation:form-strings-extension-domain
 */
final class FormStrings {

  /**
   * The translation domains of a form's strings: the extension that ships it, then core's;
   * NULL (core's only) for a form no extension ships.
   *
   * @return list<string|null>|null
   */
  public static function domain(mixed $name): ?array {
    $scanner = \Civi::service('afform_scanner');
    if (!$scanner instanceof \CRM_Afform_AfformScanner) {
      throw new \CRM_Core_Exception('The afform_scanner service is not an AfformScanner.');
    }
    $paths = is_string($name) ? $scanner->findFilePaths()[$name] ?? [] : [];
    // Sources in precedence order: the site's own copy (''), core's ang/afform ('civicrm'), extensions.
    $shipped = array_values(array_diff(array_keys(is_array($paths) ? $paths : []), ['']));
    $source = $shipped[0] ?? NULL;
    return is_string($source) && $source !== 'civicrm' ? [$source, NULL] : NULL;
  }

  /**
   * @return \Closure(string): string
   */
  public static function translator(mixed $name): \Closure {
    $domain = self::domain($name);
    return static fn (string $text): string => _ts($text, ['domain' => $domain]);
  }

}
