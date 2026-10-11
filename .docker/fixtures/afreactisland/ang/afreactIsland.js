(function (angular) {
  "use strict";

  angular
    .module("afreactIsland", CRM.angRequires("afreactIsland"))
    .component("crmSearchDisplayAfreactIsland", {
      bindings: { apiEntity: "@", search: "<", display: "<", settings: "<" },
      template: '<p class="afreact-island-note">Island note: {{ $ctrl.settings.note }}</p>',
    });
})(angular);
