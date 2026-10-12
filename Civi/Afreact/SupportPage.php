<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\AfformAdmin\AfformAdminMeta;
use Civi\Api4\AfformBehavior;
use Civi\Api4\OptionValue;
use CRM_Afreact_ExtensionUtil as E;

/**
 * Route civicrm/admin/afreact: every form with what the React renderer cannot show yet, and per
 * builder what the React builder would hand to the classic one.
 */
final class SupportPage {

  public static function render(): string {
    \CRM_Utils_System::setTitle(E::ts('React renderer support'));
    // The builders' bundle and plugins, so the report asks the editors the builders have.
    AdminPage::load('search_kit');
    $afform = self::afform();
    if ($afform !== NULL) {
      Assets::load('afform');
    }
    return Chrome::page(sprintf(
      '<div id="bootstrap-theme" class="afreact-support-page"><afreact-support listed="%s" settings="%s"></afreact-support><afreact-builders-report report="%s" afform="%s"></afreact-builders-report></div>',
      Chrome::escape(json_encode(Takeover::forms(), JSON_THROW_ON_ERROR)),
      Chrome::escape((string) \Civi::url('current://civicrm/admin/setting/afreact?reset=1')),
      Chrome::escape(json_encode(self::searchKit(), JSON_THROW_ON_ERROR)),
      Chrome::escape(json_encode($afform, JSON_THROW_ON_ERROR)),
    ));
  }

  /**
   * @return array<string, mixed>
   *   The display types by stored value with their labels, and BuilderReport's findings.
   */
  public static function searchKit(): array {
    $types = OptionValue::get(checkPermissions: FALSE)
      ->addSelect('value', 'label')
      ->addWhere('option_group_id:name', '=', 'search_display_type')
      ->addWhere('is_active', '=', TRUE)
      ->addOrderBy('weight')
      ->execute()
      ->column('label', 'value');
    return ['displayTypes' => $types] + BuilderReport::check('search_kit');
  }

  /**
   * @return array<string, mixed>|null
   *   The FormBuilder parts that bring their own admin template, and BuilderReport's findings;
   *   NULL while FormBuilder is not enabled.
   */
  public static function afform(): ?array {
    if (!in_array('afform', Builders::available(), TRUE)) {
      return NULL;
    }
    $meta = AfformAdminMeta::getModuleSettings();
    $part = static fn (string $name, mixed $label, mixed $template): array => [
      'name' => $name,
      'label' => is_string($label) ? $label : $name,
      'template' => $template,
    ];
    $elements = [];
    $inputTypes = [];
    $entities = [];
    $behaviors = [];
    foreach (Record::array($meta, 'elements') as $element) {
      $template = Record::string($element, 'admin_tpl');
      if ($template !== NULL) {
        $elements[] = $part(Record::string($element, 'directive') ?? '', Record::string($element, 'title'), $template);
      }
    }
    foreach (Record::array($meta, 'inputTypes') as $type) {
      $inputTypes[] = $part(
        Record::string($type, 'name') ?? '',
        Record::string($type, 'label'),
        Record::string($type, 'admin_template'),
      );
    }
    foreach (Record::array($meta, 'entities') as $type => $entity) {
      $template = Record::string($entity, 'options_tpl');
      if ($template !== NULL) {
        $entities[] = $part((string) $type, Record::string($entity, 'label'), $template);
      }
    }
    // deviation:behavior-get-full-select
    // civi_case's response listener reads entities and modes from every row.
    $rows = AfformBehavior::get(checkPermissions: FALSE)->addSelect(
      'key',
      'title',
      'template',
      'entities',
      'modes',
    )->execute();
    foreach ($rows as $behavior) {
      $template = Record::string($behavior, 'template');
      if ($template !== NULL && $template !== '') {
        $behaviors[] = $part(Record::string($behavior, 'key') ?? '', Record::string($behavior, 'title'), $template);
      }
    }
    return (
      [
        'elements' => $elements,
        'inputTypes' => $inputTypes,
        'entities' => $entities,
        'behaviors' => $behaviors,
      ] + BuilderReport::check('afform')
    );
  }

}
