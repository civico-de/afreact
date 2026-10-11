(function (angular) {
  "use strict";

  // Reads the parent display controller as chart_kit's editor does, and the columns once.
  angular
    .module("afreactIslandAdmin", CRM.angRequires("afreactIslandAdmin"))
    .component("searchAdminDisplayAfreactIsland", {
      bindings: { apiEntity: "<", apiParams: "<", display: "<" },
      require: { parent: "^crmSearchAdminDisplay" },
      template:
        "<div ng-include=\"'~/crmSearchAdmin/crmSearchAdminDisplayHeader.html'\"></div>" +
        '<label for="afreact-island-note">Island note</label> ' +
        '<input id="afreact-island-note" class="form-control" ng-model="$ctrl.display.settings.note"> ' +
        '<label for="afreact-island-column">Island column</label> ' +
        '<select id="afreact-island-column" class="form-control" ng-model="$ctrl.display.settings.column">' +
        '<option ng-repeat="col in $ctrl.columns" value="{{:: col }}">{{:: col }}</option></select>',
      controller: function ($scope) {
        $scope.ts = CRM.ts(null);
        this.$onInit = function () {
          this.display.settings = this.display.settings || {};
          this.display.settings.columns = this.display.settings.columns || [];
          this.columns = this.apiParams.select.slice();
        };
      },
    });
})(angular);
