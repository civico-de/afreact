<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Afform\Event\AfformValidateEvent;
use Civi\Core\Service\AutoSubscriber;

/**
 * afreact-required on submit (docs/adr/0012-own-condition-attributes.md): a field it requires in a row
 * where the field shows and is not disabled must hold a value, reported with core's message.
 */
final class RequiredRowConditions extends AutoSubscriber {

  public static function getSubscribedEvents(): array {
    return ['civi.afform.validate' => 'onValidate'];
  }

  public static function onValidate(AfformValidateEvent $event): void {
    $values = $event->getSubmittedValues();
    $submitted = SubmittedValues::of($event, $values);
    foreach (RowConditionFields::of($event->getAfform()) as $field) {
      $defn = $field->value->extra ?? $event->getEntityFieldDefn(
        $field->at->entity,
        $field->value->name,
        $field->at->join,
      );
      $core = CoreConditions::of($event->getFormDataModel(), $field, $values);
      if ($field->required === NULL || $core->exempts($defn)) {
        continue;
      }
      $label = $defn['label'] ?? $defn['title'] ?? $field->value->name;
      foreach ($field->at->rowsIn($submitted) as $row) {
        // deviation:row-conditions
        if (!$field->missingIn($submitted, $row, $core, $defn)) {
          continue;
        }
        $event->addError(\CRM_Afform_ExtensionUtil::ts('%1 is a required field.', [1 => $label]));
      }
    }
  }

}
