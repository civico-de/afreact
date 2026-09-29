{* A placed form React renders; as core's afform/InlineAfform.tpl, with the form's name in $block.afreact. *}
<div id="bootstrap-theme">
  <afreact-form name="{$block.afreact|escape}" options="{$afformOptions|@json|escape}"></afreact-form>
</div>
