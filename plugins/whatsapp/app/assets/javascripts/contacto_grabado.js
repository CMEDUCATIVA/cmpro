(function () {
  if (window.__contactoGrabadoBound === true) return;
  window.__contactoGrabadoBound = true;

  var recordingRequested = false;
  var recordingMimeType = "";
  var recordingChunks = [];
  var recordingUrl = "";
  var recordingStopRequested = false;
  var recordingIsFinalizing = false;
  var mediaStream = null;
  var mediaRecorder = null;
  var currentPhone = "";
  var currentContactId = "";
  var recorderLogUrlTemplate = "";
  var recorderLogUrl = "";
  var recorderPreviewUrlTemplate = "";
  var recorderPreviewUrl = "";
  var recorderServerLogLimit = 150;
  var recorderServerLogCount = 0;
  var waveformPeaks = [];
  var waveformDuration = 0;
  var waveformRafId = 0;
  var waveformSeekDragging = false;
  var waveformPendingSeekTime = null;
  var waveformVolumeIconImage = null;
  var waveformVolumeIconReady = false;
  var waveformLiveContext = null;
  var waveformLiveAnalyser = null;
  var waveformLiveSource = null;
  var waveformLiveData = null;
  var waveformLiveActive = false;
  var waveformRecordingStartedAt = 0;
  var waveformLiveTimerId = 0;
  var waveformLiveHistoryPeaks = [];
  var waveformLiveHistoryTimes = [];
  var waveformLiveLastSampleAt = 0;
  var waveformLiveCompressionDuration = 0;
  var recorderFinalizeWaiters = [];
  var lastCallDurationSeconds = 0;
  var resumeRetryTimer = 0;
  var resumeRetryCount = 0;
  var resumeWatchdogTimer = 0;
  var ensureRecorderPromise = null;
  var captureChunkCount = 0;
  var captureBytesTotal = 0;
  var captureZeroChunkStreak = 0;
  var captureLastPositiveAt = 0;
  var recorderRecoveryInProgress = false;
  var lastHardRecoverAt = 0;

  function resolveShell() {
    return document.querySelector(".contacto-shell");
  }

  function csrfToken() {
    var token = document.querySelector("meta[name='csrf-token']");
    return token && token.content ? token.content : "";
  }

  function buildRecorderLogUrl(contactId) {
    if (!recorderLogUrlTemplate) return "";
    var id = String(contactId || "").trim();
    if (!id) return "";
    return recorderLogUrlTemplate.replace("__CONTACT_ID__", id);
  }

  function buildRecorderPreviewUrl(contactId) {
    if (!recorderPreviewUrlTemplate) return "";
    var id = String(contactId || "").trim();
    if (!id) return "";
    return recorderPreviewUrlTemplate.replace("__CONTACT_ID__", id);
  }

  function shouldLogToServer(eventName) {
    var allow = {
      "modal.open": true,
      "modal.close": true,
      "dial.begin": true,
      "dial.navigate": true,
      "ensure.begin": true,
      "ensure.stream_ok": true,
      "ensure.mime": true,
      "ensure.recorder_created": true,
      "start.ok": true,
      "ensure.error": true,
      "ensure.unsupported": true,
      "stop.request": true,
      "stop.event": true,
      "track.ended": true,
      "render.ready": true,
      "render.skip.zero_bytes": true,
      "render.skip.empty_chunks": true,
      "audio.loadedmetadata": true,
      "audio.error": true,
      "preview.upload.ok": true,
      "preview.upload.error": true,
      "waveform.decode.error": true,
      "seek.input": true,
      "seek.apply.request": true,
      "seek.apply.success": true,
      "seek.apply.defer": true,
      "seek.apply.error": true,
      "seek.pending.applied": true,
      "seek.pending.error": true,
      "seek.canvas": true,
      "play.canvas": true,
      "volume.canvas": true,
      "resume.request": true,
      "resume.stalled.immediate_recover": true,
      "resume.retry.schedule": true,
      "resume.retry.tick": true,
      "resume.retry.giveup": true,
      "resume.watchdog.tick": true,
      "resume.watchdog.recover": true,
      "resume.watchdog.stalled": true,
      "resume.watchdog.start": true,
      "resume.watchdog.stop": true,
      "recover.hard.begin": true,
      "recover.hard.end": true,
      "recover.hard.error": true,
      "recover.hard.cooldown": true,
      "stop.ignored_stale": true,
      "ensure.resume_from_paused": true,
      "ensure.resume_from_paused.error": true,
      "ensure.recording_but_stalled": true,
      "capture.tick": true,
      "capture.summary": true
    };
    return !!allow[eventName];
  }

  function captureElapsedSeconds() {
    if (!waveformRecordingStartedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - waveformRecordingStartedAt) / 1000));
  }

  function uploadPreviewBlob(blob) {
    if (!recorderPreviewUrl || !blob || !blob.size) {
      return Promise.resolve({ url: "", token: "" });
    }
    var formData = new FormData();
    formData.append("audio", blob, "grabacion.webm");
    return fetch(recorderPreviewUrl, {
      method: "POST",
      headers: {
        "X-CSRF-Token": csrfToken()
      },
      credentials: "same-origin",
      body: formData
    }).then(function (response) {
      if (!response.ok) throw new Error("preview_upload_failed");
      return response.json();
    }).then(function (payload) {
      if (!payload || payload.ok !== true || !payload.url) throw new Error("preview_upload_invalid");
      var token = String(payload.token || "");
      logRecorder("preview.upload.ok", { has_url: true, has_token: !!token });
      return { url: String(payload.url), token: token };
    }).catch(function (error) {
      logRecorder("preview.upload.error", { message: error && error.message ? error.message : "" });
      return { url: "", token: "" };
    });
  }

  function logRecorderServer(eventName, payload) {
    if (!recorderLogUrl || !shouldLogToServer(eventName)) return;
    if (recorderServerLogCount >= recorderServerLogLimit) return;
    recorderServerLogCount += 1;
    fetch(recorderLogUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken()
      },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({
        event: eventName,
        client_time: new Date().toISOString(),
        payload: payload || {}
      })
    }).catch(function (_error) {});
  }

  function logRecorder(eventName, payload) {
    if (window.console && typeof window.console.log === "function") {
      try {
        window.console.log("[Contactos][Recorder] " + eventName, payload || {});
      } catch (_error) {}
    }
    logRecorderServer(eventName, payload);
  }

  function getCurrentRecorderPreviewToken() {
    var modal = resolveModal();
    if (!modal) return "";
    return String(modal.getAttribute("data-contacto-recorder-preview-token") || "").trim();
  }

  function flushRecorderFinalizeWaiters(ok, payload) {
    if (!recorderFinalizeWaiters.length) return;
    var pending = recorderFinalizeWaiters.slice();
    recorderFinalizeWaiters = [];
    pending.forEach(function (entry) {
      if (!entry) return;
      if (ok) {
        if (typeof entry.resolve === "function") entry.resolve(payload || {});
        return;
      }
      if (typeof entry.reject === "function") entry.reject(payload || {});
    });
  }

  function resolveModal() {
    return document.querySelector("[data-contacto-call-modal]");
  }

  function setCallDuration(value) {
    var modal = resolveModal();
    if (!modal) return;
    modal.setAttribute("data-contacto-call-duration", String(value || "00:00:00"));
  }

  function setCallDurationSeconds(seconds) {
    var normalized = Math.max(0, Math.floor(Number(seconds) || 0));
    if (normalized > (lastCallDurationSeconds || 0)) {
      lastCallDurationSeconds = normalized;
    }
    setCallDuration(formatSeconds(Math.max(normalized, lastCallDurationSeconds || 0)));
  }

  function parseDurationToSeconds(value) {
    var raw = String(value || "").trim();
    if (!raw) return 0;
    var parts = raw.split(":");
    if (parts.length !== 3) return 0;
    var hh = Number(parts[0]) || 0;
    var mm = Number(parts[1]) || 0;
    var ss = Number(parts[2]) || 0;
    if (hh < 0 || mm < 0 || ss < 0) return 0;
    return (hh * 3600) + (mm * 60) + ss;
  }

  function currentCallDurationSeconds() {
    var modal = resolveModal();
    if (!modal) return lastCallDurationSeconds || 0;
    var attrValue = String(modal.getAttribute("data-contacto-call-duration") || "");
    return Math.max(lastCallDurationSeconds || 0, parseDurationToSeconds(attrValue));
  }

  function preserveElapsedDurationFromStart() {
    if (!waveformRecordingStartedAt) return;
    var elapsed = Math.max(0, (Date.now() - waveformRecordingStartedAt) / 1000);
    if (!isFinite(elapsed)) return;
    setCallDurationSeconds(elapsed);
  }

  function setRecorderPreviewToken(value) {
    var modal = resolveModal();
    if (!modal) return;
    modal.setAttribute("data-contacto-recorder-preview-token", String(value || ""));
  }

  function resolveRecorderStatus() {
    var modal = resolveModal();
    return modal ? modal.querySelector("[data-contacto-call-recorder-status]") : null;
  }

  function resolveRecorderAudio() {
    var modal = resolveModal();
    return modal ? modal.querySelector("[data-contacto-call-recorder-audio]") : null;
  }

  function bindAudioDebugEvents(audio) {
    if (!audio || audio.dataset.contactoAudioDebugBound === "true") return;
    audio.dataset.contactoAudioDebugBound = "true";
    bindWaveformCanvas();
    audio.addEventListener("loadedmetadata", function () {
      applyPendingSeek(audio);
      refreshWaveformFromAudio();
      logRecorder("audio.loadedmetadata", {
        duration: audio.duration || 0,
        ready_state: audio.readyState || 0
      });
    });
    audio.addEventListener("canplay", function () {
      applyPendingSeek(audio);
      refreshWaveformFromAudio();
    });
    audio.addEventListener("timeupdate", function () {
      refreshWaveformFromAudio();
    });
    audio.addEventListener("play", function () {
      startWaveformAnimation();
    });
    audio.addEventListener("pause", function () {
      stopWaveformAnimation();
      refreshWaveformFromAudio();
    });
    audio.addEventListener("ended", function () {
      stopWaveformAnimation();
      refreshWaveformFromAudio();
    });
    audio.addEventListener("seeked", function () {
      refreshWaveformFromAudio();
    });
    audio.addEventListener("error", function () {
      var error = audio.error;
      stopWaveformAnimation();
      logRecorder("audio.error", {
        code: error && error.code ? error.code : 0,
        message: error && error.message ? error.message : "",
        current_src: audio.currentSrc || ""
      });
    });
  }

  function canSeekAudio(audio) {
    if (!audio) return false;
    var duration = effectiveAudioDuration(audio);
    if (!isFinite(duration) || duration <= 0) return false;
    if (audio.seekable && audio.seekable.length > 0) return true;
    return audio.readyState >= 1;
  }

  function effectiveAudioDuration(audio) {
    if (!audio) return waveformDuration || 0;
    if (isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    if (audio.seekable && audio.seekable.length > 0) {
      var end = audio.seekable.end(audio.seekable.length - 1);
      if (isFinite(end) && end > 0) return end;
    }
    return waveformDuration || 0;
  }

  function seekAudioTo(seconds) {
    var audio = resolveRecorderAudio();
    if (!audio) return false;
    var duration = effectiveAudioDuration(audio);
    logRecorder("seek.apply.request", {
      requested_seconds: Number(seconds) || 0,
      duration: duration,
      ready_state: audio.readyState || 0,
      seekable_ranges: audio.seekable ? audio.seekable.length : 0
    });
    if (!isFinite(duration) || duration <= 0) {
      waveformPendingSeekTime = Math.max(0, Number(seconds) || 0);
      logRecorder("seek.apply.defer", {
        reason: "duration_unavailable",
        pending_seconds: waveformPendingSeekTime
      });
      return false;
    }
    var target = Math.max(0, Math.min(duration, Number(seconds) || 0));
    if (!canSeekAudio(audio)) {
      waveformPendingSeekTime = target;
      logRecorder("seek.apply.defer", {
        reason: "not_seekable_yet",
        pending_seconds: waveformPendingSeekTime,
        ready_state: audio.readyState || 0
      });
      return false;
    }
    try {
      audio.currentTime = target;
      waveformPendingSeekTime = null;
      logRecorder("seek.apply.success", {
        target_seconds: target,
        current_time_after: audio.currentTime || 0
      });
      return true;
    } catch (_error) {
      waveformPendingSeekTime = target;
      logRecorder("seek.apply.error", {
        target_seconds: target,
        message: _error && _error.message ? _error.message : ""
      });
      return false;
    }
  }

  function applyPendingSeek(audio) {
    if (!audio) return;
    if (waveformPendingSeekTime === null || waveformPendingSeekTime === undefined) return;
    if (!canSeekAudio(audio)) return;
    try {
      var duration = effectiveAudioDuration(audio);
      var target = Math.max(0, Math.min(duration, Number(waveformPendingSeekTime) || 0));
      audio.currentTime = target;
      waveformPendingSeekTime = null;
      logRecorder("seek.pending.applied", {
        target_seconds: target,
        current_time_after: audio.currentTime || 0
      });
    } catch (_error) {
      logRecorder("seek.pending.error", {
        message: _error && _error.message ? _error.message : ""
      });
    }
  }

  function resolveRecorderStopButton() {
    var modal = resolveModal();
    return modal ? modal.querySelector("[data-contacto-call-recorder-stop]") : null;
  }

  function resolveRecorderClearButton() {
    var modal = resolveModal();
    return modal ? modal.querySelector("[data-contacto-call-recorder-clear]") : null;
  }

  function resolveWaveformWrap() {
    var modal = resolveModal();
    return modal ? modal.querySelector("[data-contacto-call-waveform]") : null;
  }

  function resolveWaveformCanvas() {
    var wrap = resolveWaveformWrap();
    return wrap ? wrap.querySelector("[data-contacto-call-waveform-canvas]") : null;
  }

  function resolveWaveformRuler() {
    var wrap = resolveWaveformWrap();
    return wrap ? wrap.querySelector("[data-contacto-call-waveform-ruler]") : null;
  }

  function formatSeconds(value) {
    var total = Number(value);
    if (!isFinite(total) || total < 0) total = 0;
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var seconds = Math.floor(total % 60);
    var hh = hours < 10 ? "0" + hours : String(hours);
    var mm = minutes < 10 ? "0" + minutes : String(minutes);
    var ss = seconds < 10 ? "0" + seconds : String(seconds);
    return hh + ":" + mm + ":" + ss;
  }

  function ensureWaveformVolumeIcon() {
    if (waveformVolumeIconImage) return waveformVolumeIconImage;
    var svg =
      '<svg width="25" height="25" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M10.0052 5.28367C11.4562 3.99387 13.75 5.02392 13.75 6.96534V18.2848C13.75 20.2262 11.4562 21.2563 10.0052 19.9665L6.80862 17.1251H4.75C3.50736 17.1251 2.5 16.1177 2.5 14.8751V10.3751C2.5 9.13245 3.50736 8.12509 4.75 8.12509H6.80858L10.0052 5.28367Z" fill="#323544"/>' +
      '<path d="M17.0769 15.7894C18.6384 14.0503 18.6384 11.2006 17.0769 9.46153C16.8001 9.15333 16.8256 8.67914 17.1338 8.4024C17.442 8.12566 17.9162 8.15117 18.193 8.45937C20.2664 10.7685 20.2664 14.4824 18.193 16.7915C17.9162 17.0997 17.442 17.1252 17.1338 16.8485C16.8256 16.5718 16.8001 16.0976 17.0769 15.7894Z" fill="#323544"/>' +
      '<path d="M14.9853 11.2784C15.6729 12.0429 15.6729 13.2081 14.9853 13.9726C14.7084 14.2806 14.7335 14.7548 15.0415 15.0318C15.3495 15.3088 15.8237 15.2836 16.1007 14.9756C17.3011 13.6407 17.3011 11.6102 16.1007 10.2754C15.8237 9.96736 15.3495 9.94221 15.0415 10.2192C14.7335 10.4962 14.7084 10.9704 14.9853 11.2784Z" fill="#323544"/>' +
      "</svg>";
    var image = new Image();
    image.onload = function () {
      waveformVolumeIconReady = true;
      refreshWaveformFromAudio();
    };
    image.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    waveformVolumeIconImage = image;
    return waveformVolumeIconImage;
  }

  function stopWaveformAnimation() {
    if (!waveformRafId) return;
    cancelAnimationFrame(waveformRafId);
    waveformRafId = 0;
  }

  function teardownLiveWaveform() {
    waveformLiveActive = false;
    waveformLiveData = null;
    if (waveformLiveTimerId) {
      clearInterval(waveformLiveTimerId);
      waveformLiveTimerId = 0;
    }
    if (waveformLiveSource && typeof waveformLiveSource.disconnect === "function") {
      try {
        waveformLiveSource.disconnect();
      } catch (_error) {}
    }
    if (waveformLiveAnalyser && typeof waveformLiveAnalyser.disconnect === "function") {
      try {
        waveformLiveAnalyser.disconnect();
      } catch (_error) {}
    }
    waveformLiveSource = null;
    waveformLiveAnalyser = null;
    if (waveformLiveContext && typeof waveformLiveContext.close === "function") {
      try {
        waveformLiveContext.close().catch(function () {});
      } catch (_error) {}
    }
    waveformLiveContext = null;
    waveformLiveHistoryPeaks = [];
    waveformLiveHistoryTimes = [];
    waveformLiveLastSampleAt = 0;
    waveformLiveCompressionDuration = 0;
  }

  function setupLiveWaveform(stream) {
    teardownLiveWaveform();
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !stream) return false;
    try {
      waveformLiveContext = new AudioCtx();
      waveformLiveAnalyser = waveformLiveContext.createAnalyser();
      waveformLiveAnalyser.fftSize = 1024;
      waveformLiveAnalyser.smoothingTimeConstant = 0.85;
      waveformLiveSource = waveformLiveContext.createMediaStreamSource(stream);
      waveformLiveSource.connect(waveformLiveAnalyser);
      waveformLiveData = new Uint8Array(waveformLiveAnalyser.fftSize);
      if (waveformLiveContext.state === "suspended" && typeof waveformLiveContext.resume === "function") {
        waveformLiveContext.resume().catch(function () {});
      }
      waveformLiveActive = true;
      return true;
    } catch (_error) {
      teardownLiveWaveform();
      return false;
    }
  }

  function captureLiveWaveformPeaks() {
    if (!waveformLiveActive || !waveformLiveAnalyser || !waveformLiveData) return;
    if (waveformLiveContext && waveformLiveContext.state === "suspended" && typeof waveformLiveContext.resume === "function") {
      waveformLiveContext.resume().catch(function () {});
    }
    waveformLiveAnalyser.getByteTimeDomainData(waveformLiveData);
    var canvas = resolveWaveformCanvas();
    var width = canvas ? (canvas.clientWidth || canvas.width || 640) : 640;
    var bars = Math.max(48, Math.floor(width / 4));

    // Real mic amplitude from waveform samples (no synthetic boost).
    var chunkPeak = 0;
    var sumSquares = 0;
    var n = waveformLiveData.length;
    for (var i = 0; i < n; i += 1) {
      var centered = ((waveformLiveData[i] || 128) - 128) / 128;
      var absValue = Math.abs(centered);
      if (absValue > chunkPeak) chunkPeak = absValue;
      sumSquares += centered * centered;
    }
    var rms = Math.sqrt(sumSquares / Math.max(1, n));
    var energy = Math.max(rms, chunkPeak * 0.6);
    energy = Math.max(0, Math.min(1, energy));

    var now = Date.now();
    var elapsed = waveformRecordingStartedAt ? ((now - waveformRecordingStartedAt) / 1000) : 0;
    if (!waveformLiveLastSampleAt || (now - waveformLiveLastSampleAt) >= 120) {
      waveformLiveLastSampleAt = now;
      waveformLiveHistoryPeaks.push(energy);
      waveformLiveHistoryTimes.push(elapsed);
      waveformLiveCompressionDuration = Math.max(waveformLiveCompressionDuration, elapsed);
      while (waveformLiveHistoryPeaks.length > 4000) waveformLiveHistoryPeaks.shift();
      while (waveformLiveHistoryTimes.length > 4000) waveformLiveHistoryTimes.shift();
    } else if (waveformLiveHistoryPeaks.length > 0) {
      var lastIndex = waveformLiveHistoryPeaks.length - 1;
      waveformLiveHistoryPeaks[lastIndex] = energy;
      waveformLiveHistoryTimes[lastIndex] = elapsed;
      waveformLiveCompressionDuration = Math.max(waveformLiveCompressionDuration, elapsed);
    }
  }

  function startLiveWaveformAnimation() {
    stopWaveformAnimation();
    if (waveformLiveTimerId) {
      clearInterval(waveformLiveTimerId);
      waveformLiveTimerId = 0;
    }
    var tick = function () {
      if (!waveformLiveActive || !mediaRecorder || mediaRecorder.state !== "recording") {
        waveformRafId = 0;
        return;
      }
      captureLiveWaveformPeaks();
      var elapsed = waveformRecordingStartedAt ? ((Date.now() - waveformRecordingStartedAt) / 1000) : 0;
      drawWaveform(elapsed, elapsed);
      waveformRafId = requestAnimationFrame(tick);
    };
    waveformRafId = requestAnimationFrame(tick);
  }

  function drawWaveform(currentTime, duration) {
    var canvas = resolveWaveformCanvas();
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var width = Math.max(1, canvas.clientWidth || canvas.width || 640);
    var height = Math.max(1, canvas.clientHeight || canvas.height || 88);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f8fbff";
    ctx.fillRect(0, 0, width, height);

    var controlLeft = 44;
    var controlRight = 36;
    var timelineX = controlLeft;
    var timelineWidth = Math.max(80, width - controlLeft - controlRight);
    var peaks = waveformPeaks && waveformPeaks.length ? waveformPeaks : null;
    var barCount = peaks ? peaks.length : Math.max(24, Math.floor(timelineWidth / 4));
    var durationValue = Number(duration);
    if (!isFinite(durationValue) || durationValue <= 0) durationValue = waveformDuration || 0;
    setCallDurationSeconds(durationValue);
    var isRecordingLive = !!(mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused"));
    var progress = 0;
    if (durationValue > 0) {
      progress = Math.max(0, Math.min(1, Number(currentTime || 0) / durationValue));
    }
    var playedBars = Math.floor(progress * barCount);
    var baseline = Math.floor(height / 2);
    var step = timelineWidth / barCount;
    var barWidth = Math.max(1, Math.floor(step * 0.65));

    // Silence/reference line to differentiate peaks from baseline.
    ctx.strokeStyle = "rgba(148, 163, 184, 0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(timelineX, baseline + 0.5);
    ctx.lineTo(timelineX + timelineWidth, baseline + 0.5);
    ctx.stroke();

    var playheadX = isRecordingLive
      ? Math.floor(timelineX + (timelineWidth / 2))
      : Math.floor(timelineX + progress * timelineWidth);

    if (isRecordingLive) {
      // During recording: left side shows accumulated peaks, right side stays as baseline only.
      var leftEnd = playheadX - 2;
      var leftStart = timelineX;
      var leftWidth = Math.max(10, leftEnd - leftStart);
      var leftBars = Math.max(1, Math.floor(leftWidth / 3));
      var livePeaks = new Array(leftBars).fill(0);
      var totalElapsed = Math.max(0.001, waveformLiveCompressionDuration || Number(currentTime) || 0.001);
      if (waveformLiveHistoryPeaks.length && waveformLiveHistoryTimes.length) {
        for (var hs = 0; hs < waveformLiveHistoryPeaks.length; hs += 1) {
          var t = waveformLiveHistoryTimes[hs] || 0;
          var mapped = Math.floor((t / totalElapsed) * (leftBars - 1));
          if (mapped < 0) mapped = 0;
          if (mapped >= leftBars) mapped = leftBars - 1;
          var sample = waveformLiveHistoryPeaks[hs] || 0;
          if (sample > livePeaks[mapped]) livePeaks[mapped] = sample;
        }
      }
      var liveStep = leftWidth / leftBars;
      var liveBarWidth = Math.max(1, Math.floor(liveStep * 0.75));
      for (var li = 0; li < leftBars; li += 1) {
        var lamp = livePeaks[li] || 0;
        if (!isFinite(lamp)) lamp = 0;
        lamp = Math.max(0, Math.min(1, lamp));
        if (lamp < 0.01) continue;
        var lbarHeight = Math.max(1, Math.floor(lamp * (height * 0.82)));
        var lx = Math.floor(leftStart + li * liveStep + (liveStep - liveBarWidth) / 2);
        var ly = baseline - Math.floor(lbarHeight / 2);
        ctx.fillStyle = "#1d4ed8";
        ctx.fillRect(lx, ly, liveBarWidth, lbarHeight);
      }
    } else {
      for (var i = 0; i < barCount; i += 1) {
        var amp = peaks ? peaks[i] : 0.28;
        if (!isFinite(amp)) amp = 0.2;
        amp = Math.max(0.05, Math.min(1, amp));
        var barHeight = Math.max(4, Math.floor(amp * (height * 0.78)));
        var x = Math.floor(timelineX + i * step + (step - barWidth) / 2);
        var y = baseline - Math.floor(barHeight / 2);
        ctx.fillStyle = i <= playedBars ? "#1d4ed8" : "#c8d5ea";
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    }

    // Playhead: vertical line indicating current playback position.
    ctx.fillStyle = "rgba(30, 64, 175, 0.85)";
    ctx.fillRect(Math.max(0, playheadX - 1), 0, 2, height);
    ctx.beginPath();
    ctx.arc(Math.max(4, Math.min(width - 4, playheadX)), baseline, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#1e40af";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(Math.max(4, Math.min(width - 4, playheadX)), baseline, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Canvas controls: recording indicator or play/pause at left.
    var audio = resolveRecorderAudio();
    var isPlaying = !!(audio && !audio.paused && !audio.ended);
    var isRecording = !!(mediaRecorder && mediaRecorder.state === "recording");
    if (isRecording) {
      var cx = 20;
      var cy = baseline;
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#1f2937";
      if (isPlaying) {
        ctx.fillRect(13, baseline - 10, 5, 20);
        ctx.fillRect(22, baseline - 10, 5, 20);
      } else {
        ctx.beginPath();
        ctx.moveTo(12, baseline - 11);
        ctx.lineTo(29, baseline);
        ctx.lineTo(12, baseline + 11);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Canvas controls: volume bar at right.
    var vol = audio && isFinite(audio.volume) ? audio.volume : 1;
    vol = Math.max(0, Math.min(1, vol));
    var volX = width - 16;
    var volTop = 10;
    var volHeight = height - 32;
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(volX, volTop, 4, volHeight);
    ctx.fillStyle = "#1d4ed8";
    var fillH = Math.max(2, Math.floor(volHeight * vol));
    ctx.fillRect(volX, volTop + (volHeight - fillH), 4, fillH);

    var volIcon = ensureWaveformVolumeIcon();
    if (volIcon && waveformVolumeIconReady) {
      var iconSize = 16;
      var iconX = Math.round(volX + 2 - (iconSize / 2));
      var iconY = Math.max(0, Math.round(volTop + volHeight + 4));
      ctx.drawImage(volIcon, iconX, iconY, iconSize, iconSize);
    }

    updateWaveformRuler(durationValue || 0);
  }

  function updateWaveformRuler(duration) {
    var ruler = resolveWaveformRuler();
    if (!ruler) return;
    var marks = ruler.querySelectorAll("span");
    if (!marks || marks.length < 5) return;
    var total = Number(duration);
    if (!isFinite(total) || total < 0) total = 0;
    for (var i = 0; i < marks.length; i += 1) {
      var ratio = (marks.length === 1) ? 0 : (i / (marks.length - 1));
      marks[i].textContent = formatSeconds(total * ratio);
    }
  }

  function refreshWaveformFromAudio() {
    if (waveformLiveActive && mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
      captureLiveWaveformPeaks();
      var liveElapsed = waveformRecordingStartedAt ? ((Date.now() - waveformRecordingStartedAt) / 1000) : 0;
      drawWaveform(liveElapsed, liveElapsed);
      syncWaveformControls();
      return;
    }
    var audio = resolveRecorderAudio();
    if (!audio) return;
    drawWaveform(audio.currentTime || 0, effectiveAudioDuration(audio));
    syncWaveformControls();
  }

  function startWaveformAnimation() {
    stopWaveformAnimation();
    var tick = function () {
      refreshWaveformFromAudio();
      var audio = resolveRecorderAudio();
      if (audio && !audio.paused && !audio.ended) {
        waveformRafId = requestAnimationFrame(tick);
      } else {
        waveformRafId = 0;
      }
    };
    waveformRafId = requestAnimationFrame(tick);
  }

  function setWaveformVisible(visible) {
    var wrap = resolveWaveformWrap();
    if (!wrap) return;
    wrap.classList.toggle("is-hidden", !visible);
  }

  function syncWaveformControls() {
    return;
  }

  function bindWaveformCanvas() {
    var canvas = resolveWaveformCanvas();
    if (!canvas || canvas.dataset.contactoWaveformBound === "true") return;
    canvas.dataset.contactoWaveformBound = "true";
    canvas.addEventListener("click", function (event) {
      var audio = resolveRecorderAudio();
      if (!audio) return;
      var rect = canvas.getBoundingClientRect();
      var localX = rect.width > 0 ? (event.clientX - rect.left) : 0;
      var localY = rect.height > 0 ? (event.clientY - rect.top) : 0;
      var width = rect.width || 1;
      var height = rect.height || 1;
      var controlLeft = 44;
      var controlRight = 36;
      var timelineStart = controlLeft;
      var timelineEnd = Math.max(timelineStart + 20, width - controlRight);
      if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
        if (localX <= controlLeft) {
          toggleRecorderPause();
          refreshWaveformFromAudio();
          return;
        }
      }
      var duration = effectiveAudioDuration(audio);
      if (localX <= controlLeft) {
        if (audio.paused || audio.ended) {
          applyPendingSeek(audio);
          audio.play().catch(function () {});
          logRecorder("play.canvas", { action: "play" });
        } else {
          audio.pause();
          logRecorder("play.canvas", { action: "pause" });
        }
        refreshWaveformFromAudio();
        return;
      }
      if (localX >= timelineEnd) {
        var volRatio = 1 - Math.max(0, Math.min(1, localY / height));
        audio.volume = volRatio;
        audio.muted = volRatio <= 0;
        logRecorder("volume.canvas", { value: volRatio });
        refreshWaveformFromAudio();
        return;
      }
      if (!isFinite(duration) || duration <= 0) return;
      var ratio = (localX - timelineStart) / (timelineEnd - timelineStart);
      var nextRatio = Math.max(0, Math.min(1, ratio));
      var target = duration * nextRatio;
      logRecorder("seek.canvas", { ratio: nextRatio, seconds: target });
      seekAudioTo(target);
      refreshWaveformFromAudio();
    });
  }

  function decodeWaveformFromBlob(blob) {
    if (!blob || typeof blob.arrayBuffer !== "function") return Promise.resolve();
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return Promise.resolve();
    var context = new AudioCtx();
    var decodeAudioBuffer = function (arrayBuffer) {
      var result;
      try {
        result = context.decodeAudioData(arrayBuffer.slice(0));
      } catch (error) {
        return Promise.reject(error);
      }
      if (result && typeof result.then === "function") return result;
      return new Promise(function (resolve, reject) {
        context.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      });
    };

    var closeContext = function () {
      if (context && typeof context.close === "function") {
        context.close().catch(function () {});
      }
    };

    return blob.arrayBuffer().then(function (buffer) {
      return decodeAudioBuffer(buffer);
    }).then(function (audioBuffer) {
      var data = audioBuffer.getChannelData(0);
      var canvas = resolveWaveformCanvas();
      var width = canvas ? (canvas.clientWidth || canvas.width || 640) : 640;
      var bars = Math.max(48, Math.floor(width / 3));
      var blockSize = Math.max(1, Math.floor(data.length / bars));
      var peaks = [];
      for (var i = 0; i < bars; i += 1) {
        var start = i * blockSize;
        var end = Math.min(data.length, start + blockSize);
        var step = Math.max(1, Math.floor((end - start) / 36));
        var peak = 0;
        for (var j = start; j < end; j += step) {
          var sample = Math.abs(data[j] || 0);
          if (sample > peak) peak = sample;
        }
        peaks.push(peak);
      }
      waveformPeaks = peaks;
      waveformDuration = audioBuffer.duration || 0;
      setWaveformVisible(true);
      refreshWaveformFromAudio();
      syncWaveformControls();
    }).catch(function (error) {
      logRecorder("waveform.decode.error", { message: error && error.message ? error.message : "" });
      return blob.arrayBuffer().then(function (buffer) {
        var bytes = new Uint8Array(buffer || new ArrayBuffer(0));
        var canvas = resolveWaveformCanvas();
        var width = canvas ? (canvas.clientWidth || canvas.width || 640) : 640;
        var bars = Math.max(48, Math.floor(width / 3));
        var step = Math.max(1, Math.floor(bytes.length / bars));
        var fallbackPeaks = [];
        for (var i = 0; i < bars; i += 1) {
          var start = i * step;
          var end = Math.min(bytes.length, start + step);
          var peak = 0;
          for (var j = start; j < end; j += 1) {
            var normalized = Math.abs((bytes[j] - 128) / 128);
            if (normalized > peak) peak = normalized;
          }
          fallbackPeaks.push(Math.min(1, Math.max(0.03, peak)));
        }
        waveformPeaks = fallbackPeaks;
        waveformDuration = 0;
        setWaveformVisible(true);
        refreshWaveformFromAudio();
        syncWaveformControls();
        logRecorder("waveform.decode.fallback", {
          bars: fallbackPeaks.length,
          bytes: bytes.length
        });
      }).catch(function () {
        waveformPeaks = [];
        waveformDuration = 0;
        setWaveformVisible(false);
        syncWaveformControls();
      });
    }).then(function () {
      closeContext();
    }).catch(function (error) {
      closeContext();
      throw error;
    });
  }

  function clearWaveform(options) {
    var opts = options || {};
    var preserveDuration = !!opts.preserveDuration;
    var preservedSeconds = preserveDuration ? Math.max(currentCallDurationSeconds(), lastCallDurationSeconds || 0) : 0;
    stopWaveformAnimation();
    teardownLiveWaveform();
    waveformPeaks = [];
    waveformDuration = 0;
    waveformRecordingStartedAt = 0;
    waveformPendingSeekTime = null;
    setWaveformVisible(false);
    drawWaveform(0, 0);
    if (preserveDuration && preservedSeconds > 0) {
      lastCallDurationSeconds = preservedSeconds;
      setCallDuration(formatSeconds(preservedSeconds));
    } else {
      lastCallDurationSeconds = 0;
      setCallDuration("00:00:00");
    }
    setRecorderPreviewToken("");
    syncWaveformControls();
  }

  function setRecorderStatus(message, isRecording) {
    var status = resolveRecorderStatus();
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-recording", !!isRecording);
    logRecorder("status", { message: message || "", recording: !!isRecording });
  }

  function updateRecorderButtons() {
    var stopButton = resolveRecorderStopButton();
    var clearButton = resolveRecorderClearButton();
    var isRecording = mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused");
    var hasAudio = !!recordingUrl || recordingChunks.length > 0;
    if (stopButton) stopButton.disabled = !isRecording || recordingIsFinalizing;
    if (clearButton) clearButton.disabled = !hasAudio || isRecording;
  }

  function toggleRecorderPause() {
    if (!mediaRecorder) return;
    if (mediaRecorder.state === "recording") {
      try {
        mediaRecorder.pause();
      } catch (_error) {}
      return;
    }
    if (mediaRecorder.state === "paused") {
      try {
        mediaRecorder.resume();
      } catch (_error) {}
    }
  }

  function cleanupRecordingUrl() {
    if (!recordingUrl) return;
    try {
      URL.revokeObjectURL(recordingUrl);
    } catch (_error) {}
    recordingUrl = "";
  }

  function renderRecordedAudio() {
    var audio = resolveRecorderAudio();
    if (!audio) return Promise.resolve({ hasAudio: false, token: "" });
    bindAudioDebugEvents(audio);
    if (!recordingChunks.length) {
      logRecorder("render.skip.empty_chunks", { chunks: 0 });
      preserveElapsedDurationFromStart();
      clearWaveform({ preserveDuration: true });
      cleanupRecordingUrl();
      try {
        audio.srcObject = null;
      } catch (_error) {}
      audio.removeAttribute("src");
      audio.load();
      audio.classList.add("is-hidden");
      updateRecorderButtons();
      return Promise.resolve({ hasAudio: false, token: "" });
    }
    var totalBytes = recordingChunks.reduce(function (sum, chunk) {
      return sum + (chunk && chunk.size ? chunk.size : 0);
    }, 0);
    logRecorder("render.compute", {
      chunks: recordingChunks.length,
      total_bytes: totalBytes,
      mime: recordingMimeType || ""
    });
    if (totalBytes <= 0) {
      logRecorder("render.skip.zero_bytes", {});
      preserveElapsedDurationFromStart();
      clearWaveform({ preserveDuration: true });
      cleanupRecordingUrl();
      try {
        audio.srcObject = null;
      } catch (_error) {}
      audio.removeAttribute("src");
      audio.load();
      audio.classList.add("is-hidden");
      updateRecorderButtons();
      return Promise.resolve({ hasAudio: false, token: "" });
    }
    var blob = new Blob(recordingChunks, { type: recordingMimeType || "audio/webm" });
    return uploadPreviewBlob(blob).then(function (previewData) {
      cleanupRecordingUrl();
      var renderedBy = "";
      var previewUrl = previewData && previewData.url ? String(previewData.url) : "";
      var previewToken = previewData && previewData.token ? String(previewData.token) : "";
      setRecorderPreviewToken(previewToken);
      if (previewUrl) {
        renderedBy = "server_url";
        recordingUrl = previewUrl;
        try {
          audio.srcObject = null;
        } catch (_error) {}
        audio.src = previewUrl;
      } else {
        renderedBy = "srcObject";
        try {
          audio.srcObject = blob;
          audio.removeAttribute("src");
        } catch (_error2) {
          renderedBy = "blob_url";
          try {
            audio.srcObject = null;
          } catch (_error3) {}
          recordingUrl = URL.createObjectURL(blob);
          audio.src = recordingUrl;
        }
      }
      logRecorder("render.ready", {
        blob_size: blob.size,
        blob_type: blob.type || "",
        url_present: !!recordingUrl,
        rendered_by: renderedBy
      });
      decodeWaveformFromBlob(blob);
      audio.classList.add("is-hidden");
      audio.load();
      refreshWaveformFromAudio();
      updateRecorderButtons();
      return { hasAudio: true, token: previewToken || "" };
    });
  }

  function stopMediaTracks() {
    if (!mediaStream) return;
    mediaStream.getTracks().forEach(function (track) {
      try {
        track.stop();
      } catch (_error) {}
    });
    mediaStream = null;
  }

  function hasLiveAudioTrack(stream) {
    if (!stream || typeof stream.getAudioTracks !== "function") return false;
    var tracks = stream.getAudioTracks();
    if (!tracks || !tracks.length) return false;
    for (var i = 0; i < tracks.length; i += 1) {
      if (tracks[i] && tracks[i].readyState === "live") return true;
    }
    return false;
  }

  function clearResumeRetryTimer() {
    if (!resumeRetryTimer) return;
    clearTimeout(resumeRetryTimer);
    resumeRetryTimer = 0;
  }

  function isRecorderStalled() {
    if (!(mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused"))) return false;
    var ageMs = waveformRecordingStartedAt ? (Date.now() - waveformRecordingStartedAt) : 0;
    if (ageMs < 6500) return false;
    var lastPositiveAge = captureLastPositiveAt ? (Date.now() - captureLastPositiveAt) : Number.MAX_SAFE_INTEGER;
    var noAudioSinceStart = captureBytesTotal <= 0 && captureZeroChunkStreak >= 6 && ageMs >= 8000;
    var stalledAfterAudio = captureBytesTotal > 0 && captureZeroChunkStreak >= 8 && lastPositiveAge >= 9000;
    return noAudioSinceStart || stalledAfterAudio;
  }

  function clearResumeWatchdog() {
    if (!resumeWatchdogTimer) return;
    clearInterval(resumeWatchdogTimer);
    resumeWatchdogTimer = 0;
    logRecorder("resume.watchdog.stop", {});
  }

  function startResumeWatchdog() {
    clearResumeWatchdog();
    logRecorder("resume.watchdog.start", {
      requested: recordingRequested
    });
    resumeWatchdogTimer = setInterval(function () {
      if (!recordingRequested) return;
      if (document.hidden) return;
      if (recordingIsFinalizing) return;
      var active = !!(mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused"));
      var liveTrack = hasLiveAudioTrack(mediaStream);
      var lastPositiveAge = captureLastPositiveAt ? (Date.now() - captureLastPositiveAt) : Number.MAX_SAFE_INTEGER;
      var stalled = active &&
        captureChunkCount >= 6 &&
        captureZeroChunkStreak >= 6 &&
        lastPositiveAge >= 5000;
      logRecorder("resume.watchdog.tick", {
        active: active,
        live_track: liveTrack,
        recorder_state: mediaRecorder ? mediaRecorder.state : "none",
        hidden: !!document.hidden,
        zero_streak: captureZeroChunkStreak,
        last_positive_age_ms: isFinite(lastPositiveAge) ? Math.floor(lastPositiveAge) : -1
      });
      if (stalled) {
        logRecorder("resume.watchdog.stalled", {
          chunk_count: captureChunkCount,
          zero_streak: captureZeroChunkStreak,
          last_positive_age_ms: isFinite(lastPositiveAge) ? Math.floor(lastPositiveAge) : -1
        });
      }
      if (active && liveTrack && !stalled) return;
      logRecorder("resume.watchdog.recover", {
        active: active,
        live_track: liveTrack,
        recorder_state: mediaRecorder ? mediaRecorder.state : "none",
        stalled: stalled
      });
      if (stalled) {
        hardRecoverRecorder("watchdog_stalled");
      } else {
        resumeRecordingAfterReturn("watchdog");
      }
    }, 1500);
  }

  function hardRecoverRecorder(reason) {
    if (!recordingRequested) return Promise.resolve(false);
    if (recorderRecoveryInProgress) return Promise.resolve(false);
    if (lastHardRecoverAt && (Date.now() - lastHardRecoverAt) < 12000) {
      logRecorder("recover.hard.cooldown", {
        reason: reason || "",
        since_last_ms: Date.now() - lastHardRecoverAt
      });
      return Promise.resolve(false);
    }
    recorderRecoveryInProgress = true;
    lastHardRecoverAt = Date.now();
    logRecorder("recover.hard.begin", {
      reason: reason || "",
      recorder_state: mediaRecorder ? mediaRecorder.state : "none",
      chunk_count: captureChunkCount,
      zero_streak: captureZeroChunkStreak,
      bytes_total: captureBytesTotal
    });
    preserveElapsedDurationFromStart();
    var staleRecorder = mediaRecorder;
    mediaRecorder = null;
    try {
      if (staleRecorder && (staleRecorder.state === "recording" || staleRecorder.state === "paused")) {
        if (typeof staleRecorder.requestData === "function") {
          try {
            staleRecorder.requestData();
          } catch (_error) {}
        }
        staleRecorder.stop();
      }
    } catch (_error2) {}
    stopMediaTracks();
    teardownLiveWaveform();
    clearResumeRetryTimer();
    return ensureRecorderRunning().then(function (ok) {
      logRecorder("recover.hard.end", {
        reason: reason || "",
        ok: !!ok,
        recorder_state: mediaRecorder ? mediaRecorder.state : "none"
      });
      return !!ok;
    }).catch(function (error) {
      logRecorder("recover.hard.error", {
        reason: reason || "",
        message: error && error.message ? error.message : ""
      });
      return false;
    }).finally(function () {
      recorderRecoveryInProgress = false;
    });
  }

  function scheduleResumeAttempt(source) {
    clearResumeRetryTimer();
    if (!recordingRequested) return;
    if (document.hidden) return;
    if (resumeRetryCount >= 8) {
      logRecorder("resume.retry.giveup", { source: source || "", attempts: resumeRetryCount });
      return;
    }
    resumeRetryCount += 1;
    logRecorder("resume.retry.schedule", {
      source: source || "",
      attempt: resumeRetryCount
    });
    resumeRetryTimer = setTimeout(function () {
      logRecorder("resume.retry.tick", {
        source: source || "",
        attempt: resumeRetryCount,
        recorder_state: mediaRecorder ? mediaRecorder.state : "none",
        has_live_track: hasLiveAudioTrack(mediaStream)
      });
      if (isRecorderStalled()) {
        hardRecoverRecorder(source || "retry_stalled").then(function (ok) {
          if (ok) {
            clearResumeRetryTimer();
            resumeRetryCount = 0;
            return;
          }
          scheduleResumeAttempt(source || "retry_stalled_fail");
        }).catch(function () {
          scheduleResumeAttempt(source || "retry_stalled_error");
        });
        return;
      }
      ensureRecorderRunning().then(function (ok) {
        if (ok) {
          clearResumeRetryTimer();
          resumeRetryCount = 0;
          return;
        }
        scheduleResumeAttempt(source || "retry");
      }).catch(function () {
        scheduleResumeAttempt(source || "retry_error");
      });
    }, 350);
  }

  function resumeRecordingAfterReturn(source) {
    if (!recordingRequested) return;
    if (document.hidden) return;
    clearResumeRetryTimer();
    resumeRetryCount = 0;
    logRecorder("resume.request", {
      source: source || "",
      recorder_state: mediaRecorder ? mediaRecorder.state : "none",
      has_live_track: hasLiveAudioTrack(mediaStream)
    });
    if (isRecorderStalled()) {
      logRecorder("resume.stalled.immediate_recover", {
        source: source || "",
        zero_streak: captureZeroChunkStreak,
        last_positive_age_ms: captureLastPositiveAt ? (Date.now() - captureLastPositiveAt) : -1
      });
      hardRecoverRecorder("resume_stalled_" + String(source || "unknown")).then(function (ok) {
        if (ok) {
          clearResumeRetryTimer();
          resumeRetryCount = 0;
          return;
        }
        scheduleResumeAttempt(source || "resume_stalled_false");
      }).catch(function () {
        scheduleResumeAttempt(source || "resume_stalled_error");
      });
      return;
    }
    ensureRecorderRunning().then(function (ok) {
      if (ok) {
        clearResumeRetryTimer();
        resumeRetryCount = 0;
        return;
      }
      scheduleResumeAttempt(source || "resume_false");
    }).catch(function () {
      scheduleResumeAttempt(source || "resume_error");
    });
  }

  function clearRecorderState() {
    recordingRequested = false;
    recordingStopRequested = false;
    recordingIsFinalizing = false;
    if (mediaRecorder && mediaRecorder.state === "recording") {
      try {
        mediaRecorder.stop();
      } catch (_error) {}
    }
    mediaRecorder = null;
    stopMediaTracks();
    teardownLiveWaveform();
    clearResumeRetryTimer();
    clearResumeWatchdog();
    ensureRecorderPromise = null;
    resumeRetryCount = 0;
    captureChunkCount = 0;
    captureBytesTotal = 0;
    captureZeroChunkStreak = 0;
    captureLastPositiveAt = 0;
    recorderRecoveryInProgress = false;
    lastHardRecoverAt = 0;
    waveformRecordingStartedAt = 0;
    setRecorderStatus("Sin grabacion.", false);
    updateRecorderButtons();
  }

  function forceStopForSaveFallback(reason) {
    logRecorder("force_stop_before_save", {
      reason: reason || ""
    });
    recordingRequested = false;
    recordingStopRequested = false;
    recordingIsFinalizing = false;
    teardownLiveWaveform();
    stopWaveformAnimation();
    preserveElapsedDurationFromStart();
    try {
      if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
        if (typeof mediaRecorder.requestData === "function") {
          try {
            mediaRecorder.requestData();
          } catch (_error) {}
        }
        mediaRecorder.stop();
      }
    } catch (_error2) {}
    mediaRecorder = null;
    stopMediaTracks();
    if (recordingChunks.length) {
      setRecorderStatus("Grabacion detenida para registro.", false);
    } else {
      setRecorderStatus("Grabacion detenida para registro.", false);
    }
    updateRecorderButtons();
  }

  function clearRecordedAudio() {
    if (mediaRecorder && mediaRecorder.state === "recording") return;
    recordingChunks = [];
    recordingMimeType = "";
    clearWaveform();
    renderRecordedAudio();
    setRecorderStatus("Sin grabacion.", false);
  }

  function preferredRecorderMimeType() {
    if (!window.MediaRecorder || typeof window.MediaRecorder.isTypeSupported !== "function") return "";
    var probe = document.createElement("audio");
    var candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4"
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var type = candidates[i];
      if (!window.MediaRecorder.isTypeSupported(type)) continue;
      if (!probe || typeof probe.canPlayType !== "function") return type;
      if (probe.canPlayType(type)) return type;
    }
    return "";
  }

  function ensureRecorderRunning() {
    if (ensureRecorderPromise) return ensureRecorderPromise;
    ensureRecorderPromise = ensureRecorderRunningInternal().finally(function () {
      ensureRecorderPromise = null;
    });
    return ensureRecorderPromise;
  }

  function ensureRecorderRunningInternal() {
    if (!recordingRequested) return Promise.resolve(false);
    logRecorder("ensure.begin", {
      requested: recordingRequested,
      has_media_stream: !!mediaStream,
      recorder_state: mediaRecorder ? mediaRecorder.state : "none",
      hidden: !!document.hidden
    });
    if (!window.MediaRecorder || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      logRecorder("ensure.unsupported", {
        media_recorder: !!window.MediaRecorder,
        media_devices: !!navigator.mediaDevices
      });
      setRecorderStatus("Tu navegador no soporta grabacion de audio.", false);
      return Promise.resolve(false);
    }
    if (mediaRecorder && mediaRecorder.state === "recording" && !isRecorderStalled()) {
      logRecorder("ensure.already_recording", {});
      setRecorderStatus("Grabando audio...", true);
      updateRecorderButtons();
      return Promise.resolve(true);
    }
    if (mediaRecorder && mediaRecorder.state === "recording" && isRecorderStalled()) {
      logRecorder("ensure.recording_but_stalled", {
        zero_streak: captureZeroChunkStreak,
        last_positive_age_ms: captureLastPositiveAt ? (Date.now() - captureLastPositiveAt) : -1
      });
      mediaRecorder = null;
      stopMediaTracks();
      teardownLiveWaveform();
    }
    if (mediaRecorder && mediaRecorder.state === "paused") {
      try {
        mediaRecorder.resume();
        logRecorder("ensure.resume_from_paused", {});
        setRecorderStatus("Grabando audio...", true);
        updateRecorderButtons();
        return Promise.resolve(true);
      } catch (_error) {
        logRecorder("ensure.resume_from_paused.error", {
          message: _error && _error.message ? _error.message : ""
        });
      }
    }
    if (mediaRecorder && mediaRecorder.state === "inactive") {
      mediaRecorder = null;
    }

    var liveTrack = hasLiveAudioTrack(mediaStream);
    if (!liveTrack) mediaStream = null;
    var streamPromise = liveTrack ? Promise.resolve(mediaStream) : navigator.mediaDevices.getUserMedia({ audio: true });
    return streamPromise.then(function (stream) {
      logRecorder("ensure.stream_ok", {
        tracks: stream && stream.getTracks ? stream.getTracks().length : 0
      });
      mediaStream = stream;
      setupLiveWaveform(stream);
      var mimeType = preferredRecorderMimeType();
      recordingMimeType = mimeType || recordingMimeType;
      var options = mimeType ? { mimeType: mimeType } : undefined;
      logRecorder("ensure.mime", {
        preferred: mimeType || "",
        final_mime: recordingMimeType || "",
        options_mime: options && options.mimeType ? options.mimeType : ""
      });
      recordingStopRequested = false;
      recordingIsFinalizing = false;
      mediaRecorder = new MediaRecorder(stream, options);
      var thisRecorder = mediaRecorder;
      logRecorder("ensure.recorder_created", {
        state: thisRecorder.state,
        mimeType: thisRecorder.mimeType || ""
      });
      thisRecorder.addEventListener("dataavailable", function (event) {
        if (thisRecorder !== mediaRecorder && recordingRequested) return;
        logRecorder("dataavailable", {
          size: event && event.data ? event.data.size : 0,
          type: event && event.data ? (event.data.type || "") : ""
        });
        var currentSize = event && event.data ? (event.data.size || 0) : 0;
        captureChunkCount += 1;
        if (currentSize > 0) {
          captureBytesTotal += currentSize;
          captureZeroChunkStreak = 0;
          captureLastPositiveAt = Date.now();
        } else {
          captureZeroChunkStreak += 1;
        }
        if (currentSize <= 0 || captureChunkCount <= 3 || (captureChunkCount % 5) === 0) {
          logRecorder("capture.tick", {
            chunk_count: captureChunkCount,
            chunk_size: currentSize,
            bytes_total: captureBytesTotal,
            elapsed_seconds: captureElapsedSeconds(),
            recorder_state: thisRecorder.state || "none",
            hidden: !!document.hidden,
            zero_streak: captureZeroChunkStreak,
            last_positive_age_ms: captureLastPositiveAt ? (Date.now() - captureLastPositiveAt) : -1
          });
        }
        if (event && event.data && event.data.size > 0) {
          recordingChunks.push(event.data);
          if (!recordingMimeType && event.data.type) {
            recordingMimeType = event.data.type;
          }
        }
      });
      thisRecorder.addEventListener("pause", function () {
        if (thisRecorder !== mediaRecorder && recordingRequested) return;
        logRecorder("pause.ok", {});
        setRecorderStatus("Grabacion en pausa.", false);
        stopWaveformAnimation();
        refreshWaveformFromAudio();
        updateRecorderButtons();
      });
      thisRecorder.addEventListener("resume", function () {
        if (thisRecorder !== mediaRecorder && recordingRequested) return;
        logRecorder("resume.ok", {});
        setRecorderStatus("Grabando audio...", true);
        startLiveWaveformAnimation();
        refreshWaveformFromAudio();
        updateRecorderButtons();
      });
      thisRecorder.addEventListener("stop", function () {
        if (thisRecorder !== mediaRecorder && recordingRequested) {
          logRecorder("stop.ignored_stale", {});
          return;
        }
        logRecorder("capture.summary", {
          chunk_count: captureChunkCount,
          bytes_total: captureBytesTotal,
          elapsed_seconds: captureElapsedSeconds(),
          hidden: !!document.hidden,
          stop_requested: recordingStopRequested
        });
        logRecorder("stop.event", {
          stop_requested: recordingStopRequested,
          chunks: recordingChunks.length,
          hidden: !!document.hidden
        });
        recordingIsFinalizing = false;
        teardownLiveWaveform();
        preserveElapsedDurationFromStart();
        setCallDurationSeconds(currentCallDurationSeconds());
        renderRecordedAudio().then(function () {
          updateRecorderButtons();
          if (recordingStopRequested) {
            recordingStopRequested = false;
            mediaRecorder = null;
            stopMediaTracks();
            if (recordingChunks.length) {
              setRecorderStatus("Grabacion lista para escuchar.", false);
            } else {
              setRecorderStatus("No se detecto audio grabado.", false);
            }
            flushRecorderFinalizeWaiters(true, {
              hasAudio: recordingChunks.length > 0,
              token: getCurrentRecorderPreviewToken()
            });
            return;
          }
          if (recordingRequested && !document.hidden) {
            logRecorder("stop.autorestart", {});
            setTimeout(function () {
              ensureRecorderRunning().catch(function () {});
            }, 250);
          }
          flushRecorderFinalizeWaiters(true, {
            hasAudio: recordingChunks.length > 0,
            token: getCurrentRecorderPreviewToken()
          });
        }).catch(function (error) {
          flushRecorderFinalizeWaiters(false, error);
        });
      });
      stream.getTracks().forEach(function (track) {
        track.addEventListener("ended", function () {
          logRecorder("track.ended", {
            kind: track.kind || "",
            ready_state: track.readyState || ""
          });
          if (recordingRequested && !document.hidden) {
            ensureRecorderRunning().catch(function () {});
          }
        });
      });
      thisRecorder.start(1000);
      waveformRecordingStartedAt = Date.now();
      lastCallDurationSeconds = 0;
      captureChunkCount = 0;
      captureBytesTotal = 0;
      captureZeroChunkStreak = 0;
      captureLastPositiveAt = Date.now();
      waveformLiveHistoryPeaks = [];
      waveformLiveHistoryTimes = [];
      waveformLiveLastSampleAt = 0;
      waveformLiveCompressionDuration = 0;
      setWaveformVisible(true);
      waveformDuration = 0;
      startLiveWaveformAnimation();
      drawWaveform(0, 0);
      logRecorder("start.ok", { state: thisRecorder.state });
      setRecorderStatus("Grabando audio...", true);
      updateRecorderButtons();
      startResumeWatchdog();
      return true;
    }).catch(function (error) {
      logRecorder("ensure.error", { message: error && error.message ? error.message : "" });
      setRecorderStatus("No se pudo iniciar la grabacion (permiso microfono).", false);
      updateRecorderButtons();
      return false;
    });
  }

  function stopRecorderAndFinalize() {
    logRecorder("stop.request", {
      state: mediaRecorder ? mediaRecorder.state : "none",
      chunks: recordingChunks.length
    });
    preserveElapsedDurationFromStart();
    setCallDurationSeconds(currentCallDurationSeconds());
    recordingRequested = false;
    if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
      return new Promise(function (resolve, reject) {
        recorderFinalizeWaiters.push({ resolve: resolve, reject: reject });
        recordingStopRequested = true;
        recordingIsFinalizing = true;
        teardownLiveWaveform();
        setRecorderStatus("Finalizando grabacion...", false);
        updateRecorderButtons();
        try {
          if (typeof mediaRecorder.requestData === "function") {
            mediaRecorder.requestData();
          }
        } catch (_error) {}
        try {
          mediaRecorder.stop();
        } catch (error) {
          flushRecorderFinalizeWaiters(false, error);
        }
      });
    }
    return renderRecordedAudio().then(function () {
      setCallDurationSeconds(currentCallDurationSeconds());
      updateRecorderButtons();
      stopMediaTracks();
      if (recordingChunks.length) {
        setRecorderStatus("Grabacion lista para escuchar.", false);
      } else {
        setRecorderStatus("Grabacion lista para guardar.", false);
      }
      return {
        hasAudio: recordingChunks.length > 0,
        token: getCurrentRecorderPreviewToken()
      };
    });
  }

  function startAndDial(phone) {
    var raw = String(phone || "").trim();
    if (!raw) return;
    logRecorder("dial.begin", { phone: raw });
    recordingRequested = true;
    ensureRecorderRunning().finally(function () {
      var target = "tel:" + raw;
      logRecorder("dial.navigate", { target: target });
      window.location.href = target;
    });
  }

  document.addEventListener("contacto:call_modal_open", function (event) {
    var detail = event && event.detail ? event.detail : {};
    var shell = resolveShell();
    recorderLogUrlTemplate = shell ? String(shell.getAttribute("data-contacto-call-recorder-log-url-template") || "") : "";
    recorderPreviewUrlTemplate = shell ? String(shell.getAttribute("data-contacto-call-recorder-preview-url-template") || "") : "";
    currentContactId = String(detail.contactId || "").trim();
    recorderLogUrl = buildRecorderLogUrl(currentContactId);
    recorderPreviewUrl = buildRecorderPreviewUrl(currentContactId);
    recorderServerLogCount = 0;
    currentPhone = String(detail.phone || "").trim();
    setCallDuration("00:00:00");
    lastCallDurationSeconds = 0;
    setRecorderPreviewToken("");
    clearRecorderState();
    clearRecordedAudio();
    logRecorder("modal.open", {
      contact_id: detail.contactId || "",
      chat_id: detail.chatId || "",
      phone: currentPhone
    });
  });

  document.addEventListener("contacto:call_modal_close", function () {
    logRecorder("modal.close", {});
    stopRecorderAndFinalize().catch(function () {});
    clearResumeRetryTimer();
    clearResumeWatchdog();
    resumeRetryCount = 0;
    recorderLogUrl = "";
    recorderPreviewUrl = "";
    setRecorderPreviewToken("");
  });

  document.addEventListener("contacto:call_finalize_for_save", function (event) {
    var detail = event && event.detail ? event.detail : null;
    if (!detail) return;
    detail.waitPromise = stopRecorderAndFinalize().catch(function (error) {
      logRecorder("finalize_for_save.error", {
        message: error && error.message ? error.message : ""
      });
      throw error;
    });
  });

  document.addEventListener("contacto:call_force_stop_before_save", function (event) {
    var detail = event && event.detail ? event.detail : {};
    forceStopForSaveFallback(detail.reason || "");
  });

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (target.closest("[data-contacto-call-dial]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      startAndDial(currentPhone);
      return;
    }
    if (target.closest("[data-contacto-call-recorder-stop]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      stopRecorderAndFinalize().catch(function () {});
      return;
    }
    if (target.closest("[data-contacto-call-recorder-clear]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearRecordedAudio();
    }
  }, true);

  document.addEventListener("visibilitychange", function () {
    logRecorder("visibilitychange", {
      hidden: !!document.hidden,
      requested: recordingRequested
    });
    if (document.hidden) return;
    resumeRecordingAfterReturn("visibilitychange");
  });

  window.addEventListener("focus", function () {
    logRecorder("focus", { requested: recordingRequested });
    resumeRecordingAfterReturn("focus");
  });

  window.addEventListener("pageshow", function () {
    resumeRecordingAfterReturn("pageshow");
  });
})();
