(function (angular) {
  "use strict";

  // A wallet button in place of the form's submit button, as PayPal's: enabled while the form is
  // valid, it writes its params, submits the form and finishes with its own response item.
  angular.module("afreactCheckoutButton").component("afreactCheckoutButton", {
    require: {
      afCheckoutBlock: "^^afCheckoutBlock",
      afForm: "^^afForm",
    },
    template: "",
    controller: function ($scope, $element) {
      const ts = CRM.ts("afreactcheckout");
      const submitButton = () =>
        $element[0].closest("af-form").querySelector('button[ng-click="afform.submit()"]');

      this.$onInit = () => {
        this.container = document.createElement("div");
        this.container.className = "afreact-checkout-button";
        this.button = document.createElement("button");
        this.button.type = "button";
        this.button.className = "btn btn-primary";
        this.button.addEventListener("click", () => $scope.$apply(() => this.pay()));
        this.status = document.createElement("p");
        this.status.setAttribute("role", "status");
        this.container.append(this.button, this.status);
        submitButton().style.display = "none";
        submitButton().after(this.container);
        $scope.$watch(
          () => this.afCheckoutBlock.getContributionValue("currency"),
          (currency) => {
            const wallet = this.afCheckoutBlock.getCheckoutOption().wallet;
            this.button.textContent = ts("Pay %1 with %2", { 1: currency || "", 2: wallet });
          },
        );
        $scope.$watch(
          () => this.afForm.ngForm.$valid,
          (valid) => {
            this.button.disabled = !valid;
          },
        );
      };

      this.$onDestroy = () => {
        this.container.remove();
        submitButton().style.display = null;
      };

      this.pay = () => {
        this.afCheckoutBlock.checkout_params.payment_source_type = "demo-wallet";
        this.afCheckoutBlock.exportParamValues();
        const form = $element.closest("af-form");
        const done = () => form.off("crmFormSuccess", success).off("crmFormError", failure);
        const success = (event, data) => {
          done();
          const item =
            data.submissionResponse &&
            data.submissionResponse[0] &&
            data.submissionResponse[0].afreactcheckout_button;
          if (!item) {
            this.status.textContent = ts("Missing submission response");
            return;
          }
          form[0].hidden = true;
          const message = document.createElement("div");
          message.setAttribute("role", "status");
          message.textContent = ts("Order %1 approved, paid by %2.", {
            1: item.order,
            2: item.source,
          });
          form[0].after(message);
        };
        const failure = (event, data) => {
          done();
          this.status.textContent =
            data && data.error && data.error.error_message
              ? data.error.error_message
              : ts("Error setting up payment");
        };
        form.on("crmFormSuccess", success).on("crmFormError", failure);
        this.afForm.submit();
      };
    },
  });
})(angular);
