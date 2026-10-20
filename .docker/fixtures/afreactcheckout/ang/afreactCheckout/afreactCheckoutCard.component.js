(function (angular) {
  "use strict";

  // Card fields bound to the block's checkout_params through a getter, as PayflowPro's card checkout.
  angular.module("afreactCheckout").component("afreactCheckoutCard", {
    require: { afCheckoutBlock: "^^afCheckoutBlock" },
    templateUrl: "~/afreactCheckout/cardFields.html",
    controller: function ($scope) {
      $scope.ts = CRM.ts("afreactcheckout");
      this.months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
      this.years = ["2030", "2031", "2032"];

      this.$onInit = () => {
        Object.defineProperty(this, "checkout_params", {
          get: () => this.afCheckoutBlock.checkout_params,
          configurable: true,
        });
        if (!this.checkout_params.credit_card_exp_date) {
          this.checkout_params.credit_card_exp_date = {};
        }
        this.cardTypeOptions = this.afCheckoutBlock.getCheckoutOption().cardTypeOptions || [];
      };
    },
  });
})(angular);
