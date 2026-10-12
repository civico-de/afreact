<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Action\Afform\Submit;
use Civi\Api4\Afform;
use Civi\Api4\Generic\Result;
use Civi\API\Event\RespondEvent;
use Civi\Core\Service\AutoSubscriber;

/**
 * Afform.submit returns the confirmation message with the submitted values HTML-escaped and the
 * redirect with them URL-encoded. Core substitutes them as they are, which lets a submitter
 * inject markup or reshape the redirect's query string.
 */
final class ConfirmationMessage extends AutoSubscriber {

  /**
   * Core's token pattern in AbstractProcessor::replaceTokens, plus the JWT token it also replaces.
   */
  private const PLACEHOLDER = '/\[[a-zA-Z0-9_]+\.[0-9]+\.[^]]+]|\[token]/';

  /**
   * Response key => the form setting it is made from and how a token value is encoded.
   */
  private const TEMPLATES = [
    'message' => ['confirmation_message', 'htmlspecialchars'],
    'redirect' => ['redirect', 'rawurlencode'],
  ];

  public static function getSubscribedEvents(): array {
    return ['civi.api.respond' => ['onRespond', Takeover::AFTER_CORE]];
  }

  public static function onRespond(RespondEvent $event): void {
    $submit = $event->getApiRequest();
    $result = $event->getResponse();
    if (!$submit instanceof Submit || $submit->getActionName() !== 'submit' || !$result instanceof Result) {
      return;
    }
    $response = $result[0] ?? NULL;
    if (!is_array($response)) {
      return;
    }
    $form = NULL;
    // deviation:confirmation-message-escaped
    foreach (self::TEMPLATES as $key => [$setting, $encode]) {
      $value = Record::string($response, $key);
      if ($value === NULL) {
        continue;
      }
      $form ??= Afform::get(checkPermissions: FALSE)
        ->addWhere('name', '=', $submit->getName())
        ->addSelect('confirmation_message', 'redirect')
        ->execute()
        ->first();
      $template = Record::string($form, $setting);
      // A value another listener set, such as a payment checkout URL, stays as it is.
      if ($template === NULL || $value !== $submit->replaceTokens($template)) {
        continue;
      }
      $response[$key] = preg_replace_callback(
        self::PLACEHOLDER,
        static fn (array $token): string => $encode($submit->replaceTokens($token[0])),
        $template,
      ) ?? throw new \RuntimeException("Confirmation {$key}: " . preg_last_error_msg());
    }
    $result[0] = $response;
  }

}
