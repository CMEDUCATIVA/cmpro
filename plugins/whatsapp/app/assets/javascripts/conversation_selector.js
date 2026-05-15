(function () {
  function getSelect() {
    return document.querySelector("[data-wa-conversation-selector]");
  }

  function getStatusFromChat(chat) {
    var raw = chat && chat.conversation_status ? String(chat.conversation_status).trim().toLowerCase() : "";
    return raw === "ended" ? "ended" : "started";
  }

  function shouldShowUnread(chat, count) {
    return count > 0 && getStatusFromChat(chat) !== "ended";
  }

  function sync(chatId, chatStatus) {
    var select = getSelect();
    if (!select) return;

    var hasChat = !!chatId;
    select.disabled = !hasChat;
    if (!hasChat) {
      select.value = "started";
      return;
    }

    if (chatStatus) {
      select.value = getStatusFromChat({ conversation_status: chatStatus });
      return;
    }

    var root = document.querySelector(".wa-shell");
    var url = root ? root.getAttribute("data-wa-contact-profile-url") : "";
    if (!url) return;

    fetch(url + "?chat_id=" + encodeURIComponent(chatId), {
      headers: { "Accept": "application/json" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error("wa_conversation_profile_failed");
        return response.json();
      })
      .then(function (payload) {
        var profile = payload && payload.profile ? payload.profile : {};
        select.value = getStatusFromChat({ conversation_status: profile.conversation_status });
      })
      .catch(function () {});
  }

  function bind() {
    var select = getSelect();
    if (!select || select.dataset.bound === "true") return;
    select.dataset.bound = "true";

    select.addEventListener("change", function () {
      var header = document.querySelector(".wa-chat-header");
      var chatId = header ? (header.getAttribute("data-chat-id") || "") : "";
      if (!chatId) return;

      var root = document.querySelector(".wa-shell");
      var url = root ? root.getAttribute("data-wa-contact-profile-url") : "";
      if (!url) return;

      var token = document.querySelector("meta[name='csrf-token']");
      var payload = {
        chat_id: chatId,
        conversation_status: select.value === "ended" ? "ended" : "started"
      };

      fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-Token": token ? token.content : ""
        },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data || {} };
          });
        })
        .then(function (result) {
          if (!result.ok) throw result.data || {};
          var normalized = getStatusFromChat({ conversation_status: result.data.conversation_status });
          select.value = normalized;
          if (window.updateChatCard) {
            window.updateChatCard({
              id: chatId,
              conversation_status: normalized,
              unread_count: normalized === "ended" ? 0 : undefined
            }, { moveToTop: false, source: "conversation_selector" });
          }
        })
        .catch(function () {
          sync(chatId);
        });
    });
  }

  window.WAConversationSelector = {
    bind: bind,
    sync: sync,
    shouldShowUnread: shouldShowUnread
  };
})();
