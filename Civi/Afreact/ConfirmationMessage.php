<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Action\Afform\Submit;
use Civi\Api4\Afform;
use Civi\Api4\Generic\Result;
use Civi\API\Event\RespondEvent;
use Civi\Core\Service\AutoSubscriber;

/**
 * Afform.submit returns the confirmation message with the submitted values HTML-escaped. Core
 * substitutes them into the admin's HTML as they are, which lets a submitter inject markup.
 */
final class ConfirmationMessage extends AutoSubscriber {

  /**
   * Core's token pattern in AbstractProcessor::replaceTokens, plus the JWT token it also replaces.
   */
  private const PLACEHOLDER = '/\[[a-zA-Z0-9_]+\.[0-9]+\.[^]]+]|\[token]/';

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
    $message = Record::string($response, 'message');
    if (!is_array($response) || $message === NULL) {
      return;
    }
    $template = Record::string(
      Afform::get(checkPermissions: FALSE)
        ->addWhere('name', '=', $submit->getName())
        ->addSelect('confirmation_message')
        ->execute()
        ->first(),
      'confirmation_message',
    );
    // A message another listener set stays as it is.
    if ($template === NULL || $message !== $submit->replaceTokens($template)) {
      return;
    }
    $response['message'] = preg_replace_callback(
      self::PLACEHOLDER,
      static fn (array $token): string => htmlspecialchars($submit->replaceTokens($token[0])),
      $template,
    ) ?? throw new \RuntimeException('Confirmation message: ' . preg_last_error_msg());
    $result[0] = $response;
  }

}
