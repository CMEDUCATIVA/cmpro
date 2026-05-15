(function () {
  function bindContactDeleteAjax() {
    if (document.body.dataset.contactoDeleteAjaxBound === "true") return;
    document.body.dataset.contactoDeleteAjaxBound = "true";

    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!form || !form.hasAttribute("data-contacto-confirm")) return;

      var row = form.closest("tr[data-contacto-id]");
      if (!row) return;

      event.preventDefault();
      if (!window.confirm("Seguro que quieres eliminar este contacto?")) return;

      var token = document.querySelector("meta[name='csrf-token']");
      var formData = new FormData(form);

      fetch(form.getAttribute("action") || "", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Accept": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: formData
      })
        .then(function (response) {
          if (!response.ok) throw response;
          return response.json();
        })
        .then(function () {
          var menu = form.closest(".contacto-settings-dropdown");
          if (menu) menu.classList.add("is-hidden");
          row.remove();
        })
        .catch(function () {});
    });
  }

  function init() {
    bindContactDeleteAjax();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  document.addEventListener("turbo:load", init);
  document.addEventListener("turbo:before-cache", function () {
    document.body.dataset.contactoDeleteAjaxBound = "";
  });
})();
