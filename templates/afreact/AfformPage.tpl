{* A form page React renders; as core's AfformBase.tpl, which wraps the form in #bootstrap-theme. *}
{* Nothing placed the form, so `options.x` in its filters names nothing, as on core's page. *}
<div id="bootstrap-theme" class="afreact-page">
  <afreact-form name="{$afreactName|escape}" options="{ldelim}{rdelim}" page-title></afreact-form>
</div>
