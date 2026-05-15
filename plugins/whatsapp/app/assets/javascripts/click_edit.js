(function () {
  function bindNameClickEdit() {
    if (document.body.dataset.contactoNameClickEditBound === "true") return;
    document.body.dataset.contactoNameClickEditBound = "true";

    document.addEventListener("click", function (event) {
      var trigger = event.target.closest("[data-contacto-open-edit='true']");
      if (!trigger) return;

      event.preventDefault();
      event.stopPropagation();

      var row = trigger.closest("tr[data-contacto-id]");
      if (!row) return;

      var editButton = row.querySelector("[data-contacto-edit='true']");
      if (!editButton) return;

      editButton.click();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindNameClickEdit);
  } else {
    bindNameClickEdit();
  }

  document.addEventListener("turbo:load", bindNameClickEdit);
  document.addEventListener("turbo:before-cache", function () {
    document.body.dataset.contactoNameClickEditBound = "";
  });
})();
