<?php

declare(strict_types = 1);

namespace Civi\Afreact;

use Civi\Api4\Afform;
use Civi\Api4\Contact;
use Civi\Api4\Email;
use Civi\Api4\Phone;
use Civi\Test\CiviEnvBuilder;
use Civi\Test\HeadlessInterface;
use PHPUnit\Framework\TestCase;

/**
 * afreact-if, afreact-required and afreact-disabled on Afform.submit (ADR 0012).
 *
 * Not transactional: Afform stores forms as files, and saving one can clear civicrm_menu by
 * TRUNCATE, which commits any open transaction.
 *
 * @group headless
 */
class RowConditionsHeadlessTest extends TestCase implements HeadlessInterface {

  private const FORM = 'afformAfreactRowConditionsProbe';

  private const MOBILE = '[["[Individual1.0.Phone.@.phone_type_id]", "=", 2]]';

  private const LANDLINE = '[["[Individual1.0.Phone.@.phone_type_id]", "=", 1]]';

  /**
   * @var list<int>
   */
  private array $contacts = [];

  public function setUpHeadless(): CiviEnvBuilder {
    return GetFormHeadlessTest::builder();
  }

  protected function setUp(): void {
    parent::setUp();
    $mobile = htmlspecialchars(self::MOBILE);
    $landline = htmlspecialchars(self::LANDLINE);
    $named = htmlspecialchars('[["[Individual1.0.first_name]", "=", "Probe"]]');
    $homeEmail = htmlspecialchars('[["[Individual1.0.Email.0.location_type_id]", "=", 1]]');
    $codeY = htmlspecialchars('[["[extra.0.code]", "=", "y"]]');
    $code = htmlspecialchars('[["[extra.0.code]", "=", "x"]]');
    $nobody = htmlspecialchars('([["Individual1[0][fields][first_name]","=","\\"nobody\\""]])');
    $noNick = htmlspecialchars('[["[Individual1.0.nick_name]", "IS NULL"]]');
    $phone = htmlspecialchars('[["[Individual1.0.Phone.@.phone]", "IS NOT EMPTY"]]');
    Afform::save(checkPermissions: FALSE)
      ->addRecord([
        'name' => self::FORM,
        'type' => 'form',
        'title' => 'Row conditions probe',
        'layout' => <<<HTML
          <af-form ctrl="afform">
            <af-entity type="Individual" name="Individual1" label="Individual 1" actions="{create: true, update: false}" security="FBAC" />
            <fieldset af-fieldset="Individual1">
              <af-field name="first_name" />
              <af-field name="last_name" defn="{disabled: true}" afreact-required="{$named}" />
              <af-field name="job_title" afreact-required="[]" />
              <af-field name="formal_title" afreact-required="{$homeEmail}" />
              <af-field name="birth_date" afreact-required="{$code}" />
              <af-field defn="{name: 'code', label: 'Code', input_type: 'Text'}" />
              <af-field defn="{name: 'note', label: 'Note', input_type: 'Text'}" afreact-required="{$code}" />
              <af-field name="nick_name" />
              <af-field name="middle_name" afreact-required="{$noNick}" />
              <div af-join="Email" data="{location_type_id: 1}">
                <af-field name="email" />
                <af-field name="is_bulkmail" afreact-disabled="{$named}" />
              </div>
              <div af-join="Email" data="{location_type_id: 2}">
                <af-field name="email" />
                <af-field name="is_bulkmail" />
              </div>
              <div af-join="Phone" af-repeat="Add">
                <af-field name="phone_type_id" />
                <af-field name="phone" />
                <af-field name="phone_ext" afreact-required="{$mobile}" />
                <af-field name="location_type_id" />
                <af-field name="is_billing" afreact-disabled="{$landline}" />
                <div afreact-if="{$mobile}">
                  <af-field name="mobile_provider_id" afreact-required="{$phone}" />
                </div>
                <af-field name="is_primary" afreact-required="([[broken" />
                <af-field defn="{name: 'per_phone', label: 'Per Phone', input_type: 'Text'}" afreact-required="{$mobile}" />
                <div afreact-if="{$landline}">
                  <af-field name="is_billing" afreact-disabled="{$mobile}" />
                </div>
                <div af-if="{$nobody}">
                  <af-field name="is_billing" afreact-disabled="{$named}" />
                </div>
              </div>
            </fieldset>
            <af-field defn="{name: 'outside', label: 'Outside', input_type: 'Text'}" afreact-required="{$codeY}" />
          </af-form>
          HTML,
      ])
      ->setLayoutFormat('html')
      ->execute();
  }

  protected function tearDown(): void {
    Afform::revert(checkPermissions: FALSE)->addWhere('name', '=', self::FORM)->execute();
    Contact::delete(checkPermissions: FALSE)
      ->addWhere('id', 'IN', $this->contacts ?: [0])
      ->setUseTrash(FALSE)
      ->execute();
    // Later transactional tests must not find the menu empty.
    \Civi::router()->rebuild();
    parent::tearDown();
  }

  // deviation:row-conditions
  public function testAFieldIsRequiredInTheRowsWhereItsConditionHolds(): void {
    $this->expectExceptionMessage('Phone Extension is a required field.');
    $this->expectExceptionMessageMatches('/^[^\n]+$/');
    $this->submit([['phone_type_id' => 1], ['phone_type_id' => 2, 'mobile_provider_id' => 1]], extra: [
      'per_phone' => 'p',
    ]);
  }

  public function testAHiddenFieldIsNotRequiredAndAShownOneIs(): void {
    $this->expectExceptionMessage('Mobile Provider is a required field.');
    $this->expectExceptionMessageMatches('/^[^\n]+$/');
    $this->submit([['phone_type_id' => 1], ['phone_type_id' => 2, 'phone_ext' => '2']], extra: ['per_phone' => 'p']);
  }

  /**
   * The other is_billing fields, hidden in Mobile rows by afreact-if and everywhere by af-if, leave
   * the value to the one shown.
   */
  public function testADisabledFieldIsNotSavedInItsRow(): void {
    $id = $this->submit([
      ['phone_type_id' => 1, 'phone' => '111', 'is_billing' => TRUE],
      ['phone_type_id' => 2, 'phone' => '222', 'phone_ext' => '2', 'mobile_provider_id' => 1, 'is_billing' => TRUE],
    ], extra: ['per_phone' => 'p']);
    $saved = Phone::get(checkPermissions: FALSE)
      ->addWhere('contact_id', '=', $id)
      ->addSelect('phone', 'is_billing')
      ->execute()
      ->column('is_billing', 'phone');
    $this->assertSame(['111' => FALSE, '222' => TRUE], $saved);
  }

  /**
   * last_name's defn disables it, so its holding afreact-required does not apply either.
   */
  public function testAConditionThatDoesNotParseRequiresNothing(): void {
    $this->assertGreaterThan(0, $this->submit([['phone_type_id' => 1, 'phone' => '111']]));
  }

  /**
   * The Email block's data sets location_type_id only as core saves it; the browser never had it.
   */
  public function testAConditionReadsTheValuesTheBrowserSent(): void {
    $this->assertGreaterThan(0, $this->submit([['phone_type_id' => 1]], emails: [['email' => 'one@example.org']]));
  }

  public function testAConditionReadsExtraFieldsAsTheBrowserKeepsThem(): void {
    $this->expectExceptionMessage('Birth Date is a required field.');
    $this->submit([['phone_type_id' => 1]], extra: ['code' => 'x', 'note' => 'n']);
  }

  public function testAnExtraFieldIsRequiredWhereItsConditionHolds(): void {
    $this->expectExceptionMessage('Note is a required field.');
    $this->submit([['phone_type_id' => 1]], ['birth_date' => '2000-01-01'], extra: ['code' => 'x']);
  }

  public function testAnExtraFieldOutsideAFieldsetIsRequiredWhereItsConditionHolds(): void {
    $this->assertGreaterThan(0, $this->submit([['phone_type_id' => 1]], extra: ['code' => 'y', 'outside' => 'o']));
    $this->expectExceptionMessage('Outside is a required field.');
    $this->submit([['phone_type_id' => 1]], extra: ['code' => 'y']);
  }

  public function testAnExtraFieldReadsTheRowItSitsIn(): void {
    $this->expectExceptionMessage('Per Phone is a required field.');
    $this->submit([['phone_type_id' => 1], ['phone_type_id' => 2, 'phone_ext' => '2', 'mobile_provider_id' => 1]]);
  }

  public function testAnEmptyListHoldsAsInTheBrowser(): void {
    $this->expectExceptionMessage('Job Title is a required field.');
    $this->submit([['phone_type_id' => 1]], ['job_title' => '']);
  }

  public function testANullValueIsNullAsInTheBrowser(): void {
    $this->expectExceptionMessage('Middle Name is a required field.');
    $this->submit([['phone_type_id' => 1]], ['nick_name' => NULL]);
  }

  public function testADisabledFieldInAJoinBlockLeavesTheOtherBlocksRow(): void {
    $id = $this->submit([['phone_type_id' => 1]], emails: [
      ['email' => 'one@example.org', 'is_bulkmail' => TRUE],
      ['email' => 'two@example.org', 'is_bulkmail' => TRUE],
    ]);
    $saved = Email::get(checkPermissions: FALSE)
      ->addWhere('contact_id', '=', $id)
      ->addSelect('email', 'is_bulkmail')
      ->execute()
      ->column('is_bulkmail', 'email');
    $this->assertSame(['one@example.org' => FALSE, 'two@example.org' => TRUE], $saved);
  }

  /**
   * @param list<array<string, mixed>> $phones
   * @param array<string, mixed> $fields
   * @param list<array<string, mixed>> $emails
   * @param array<string, mixed> $extra
   * @return int The saved contact.
   */
  private function submit(array $phones, array $fields = [], array $emails = [], array $extra = []): int {
    $phones = array_map(
      static fn (array $phone): array => $phone + ['location_type_id' => 1, 'phone' => '100'],
      $phones,
    );
    $response = Afform::submit(checkPermissions: FALSE)
      ->setName(self::FORM)
      ->setValues([
        'Individual1' => [[
          'fields' => $fields + ['first_name' => 'Probe', 'job_title' => 'Probe'],
          'joins' => ['Phone' => $phones, 'Email' => $emails],
        ]],
        'extra' => ['fields' => $extra],
      ])
      ->execute()
      ->single();
    $id = $response['Individual1'][0]['id'];
    $this->contacts[] = $id;
    return $id;
  }

}
