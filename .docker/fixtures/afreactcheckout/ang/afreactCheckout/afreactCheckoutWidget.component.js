(function (angular, $) {
  "use strict";

  // After a successful submit, the form gives way to a widget mounted from the response, as
  // Stripe's embedded checkout; the widget is local and loads nothing.
  angular.module("afreactCheckout").component("afreactCheckoutWidget", {
    require: { afCheckoutBlock: "^^afCheckoutBlock" },
    template: "<p>{{:: ts('You finish the payment in the next step.') }}</p>",
    controller: function ($scope, $element) {
      $scope.ts = CRM.ts("afreactcheckout");
      const form = () => $element.closest("af-form");
      const listener = (event, data) => {
        const item =
          data.submissionResponse &&
          data.submissionResponse[0] &&
          data.submissionResponse[0].afreactcheckout_widget;
        if (!item || !item.client_secret) {
          throw new Error("Missing demo widget client secret");
        }
        const key = this.afCheckoutBlock.getCheckoutOption().public_key;
        form().hide();
        $('<div id="afreact-checkout-widget" role="status" />')
          .text(`Demo widget ${key} mounted with ${item.client_secret}.`)
          .insertAfter(form());
      };

      this.$onInit = () => {
        form().on("crmFormSuccess", listener);
      };

      this.$onDestroy = () => {
        form().off("crmFormSuccess", listener);
      };
    },
  });
})(angular, CRM.$);
