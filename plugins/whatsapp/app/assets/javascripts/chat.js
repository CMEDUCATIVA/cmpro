(function () {
  function sendMessage(url, token, payload) {
    return fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": token || ""
      },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) {
        return response.json().then(function (data) {
          throw data;
        });
      }
      return response.json();
    });
  }

  window.WAChat = window.WAChat || {};
  window.WAChat.sendMessage = sendMessage;
  window.WAChat.sendImage = sendMessage;
  window.WAChat.sendVideo = sendMessage;
})();
