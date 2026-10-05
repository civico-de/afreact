<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Afform\Event\AfformSubmitEvent;
use Civi\Api4\Afform;
use Civi\Api4\AfformSubmission;
use Civi\Api4\Contact;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * The confirmation message Afform.submit returns.
 *
 * Not transactional: Afform stores forms as files, and saving one can clear civicrm_menu by
 * TRUNCATE, which commits any open transaction.
 *
 * @group headless
 */
class ConfirmationMessageHeadlessTest extends TestCase implements HeadlessInterface {

  private const FORM = 'afformAfreactConfirmationProbe';

  private const MARKUP = '"><img src=x onerror=alert(1)>';

  private const ESCAPED = '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;';

  /**
   * @var list<int>
   */
  private array $contacts = [];

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  protected function setUp(): void {
    parent::setUp();
    $this->saveForm([]);
  }

  /**
   * @param array<string, mixed> $settings
   */
  private function saveForm(array $settings): void {
    Afform::save(checkPermissions: FALSE)
      ->addRecord(
        $settings
        + [
          'name' => self::FORM,
          'type' => 'form',
          'title' => 'Confirmation probe',
          'confirmation_type' => 'show_confirmation_message',
          'confirmation_message' => '<p title="[Individual1.0.first_name]"><strong>Thanks</strong>, [Individual1.0.first_name] [Individual1.0.last_name] (#[Individual1.0.id]).</p>',
          'layout' => <<<'HTML'
            <af-form ctrl="afform">
              <af-entity type="Individual" name="Individual1" label="Individual 1" actions="{create: true, update: false}" security="FBAC" />
              <fieldset af-fieldset="Individual1">
                <af-field name="first_name" />
                <af-field name="last_name" />
              </fieldset>
            </af-form>
            HTML,
        ],
      )
      ->setLayoutFormat('html')
      ->execute();
  }

  protected function tearDown(): void {
    Afform::revert(checkPermissions: FALSE)->addWhere('name', '=', self::FORM)->execute();
    Contact::delete(checkPermissions: FALSE)
      ->addWhere('id', 'IN', $this->contacts)
      ->setUseTrash(FALSE)
      ->execute();
    // Later transactional tests must not find the menu empty.
    \CRM_Core_Menu::store();
    parent::tearDown();
  }

  public function testSubmittedValuesAreEscapedAndTheAdminsMarkupKept(): void {
    $response = $this->submit(self::MARKUP, 'Probe');
    $this->assertSame(
      $this->message(self::ESCAPED, 'Probe', $response['Individual1'][0]['id']),
      $response['message'],
    );
  }

  /**
   * A reviewer processing a pending submission of a form with manual processing.
   */
  public function testValuesOfAProcessedSubmissionAreEscaped(): void {
    $this->saveForm(['manual_processing' => TRUE]);
    $values = ['Individual1' => [['fields' => ['first_name' => self::MARKUP, 'last_name' => 'Probe']]]];
    $submission = AfformSubmission::create(checkPermissions: FALSE)
      ->setValues(['afform_name' => self::FORM, 'data' => $values, 'status_id:name' => 'Pending'])
      ->execute()
      ->single();
    $response = $this->submit(self::MARKUP, 'Probe', ['sid' => $submission['id']]);
    $this->assertSame(
      $this->message(self::ESCAPED, 'Probe', $response['Individual1'][0]['id']),
      $response['message'],
    );
  }

  public function testATokenTypedIntoAFieldStaysText(): void {
    $response = $this->submit('[Individual1.0.last_name]', self::MARKUP);
    $this->assertSame(
      $this->message('[Individual1.0.last_name]', self::ESCAPED, $response['Individual1'][0]['id']),
      $response['message'],
    );
  }

  public function testSubmittedValuesAreUrlEncodedInTheRedirect(): void {
    $this->saveForm([
      'confirmation_type' => 'redirect_to_url',
      'redirect' => 'civicrm/contact/view?reset=1&cid=[Individual1.0.id]&name=[Individual1.0.last_name]',
    ]);
    $response = $this->submit('Probe', 'A&B=C #x');
    $this->assertSame(
      "civicrm/contact/view?reset=1&cid={$response['Individual1'][0]['id']}&name=A%26B%3DC%20%23x",
      $response['redirect'],
    );
  }

  public function testARedirectAnotherListenerSetIsLeftAsItIs(): void {
    $this->saveForm(['confirmation_type' => 'redirect_to_url', 'redirect' => 'civicrm/home?x=[Individual1.0.last_name]']);
    $set = static function (AfformSubmitEvent $event): void {
      $event->getApiRequest()->setResponseItem('redirect', 'https://pay.example.org/?a=1&b=2');
    };
    \Civi::dispatcher()->addListener('civi.afform.submit', $set);
    try {
      $this->assertSame('https://pay.example.org/?a=1&b=2', $this->submit('Probe', 'A&B')['redirect']);
    }
    finally {
      \Civi::dispatcher()->removeListener('civi.afform.submit', $set);
    }
  }

  public function testAMessageAnotherListenerSetIsLeftAsItIs(): void {
    $set = static function (AfformSubmitEvent $event): void {
      $event->getApiRequest()->setResponseItem('message', '<em>Set by a listener</em>');
    };
    \Civi::dispatcher()->addListener('civi.afform.submit', $set);
    try {
      $this->assertSame('<em>Set by a listener</em>', $this->submit(self::MARKUP, 'Probe')['message']);
    }
    finally {
      \Civi::dispatcher()->removeListener('civi.afform.submit', $set);
    }
  }

  /**
   * @param array<string, mixed> $args
   * @return array<string, mixed>
   */
  private function submit(string $firstName, string $lastName, array $args = []): array {
    $response = Afform::submit(checkPermissions: FALSE)
      ->setName(self::FORM)
      ->setArgs($args)
      ->setValues(['Individual1' => [['fields' => ['first_name' => $firstName, 'last_name' => $lastName]]]])
      ->execute()
      ->single();
    $this->contacts[] = $response['Individual1'][0]['id'];
    return $response;
  }

  private function message(string $firstName, string $lastName, int $id): string {
    return "<p title=\"{$firstName}\"><strong>Thanks</strong>, {$firstName} {$lastName} (#{$id}).</p>";
  }

}
