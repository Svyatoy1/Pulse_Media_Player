import "./style.css";

const media = document.querySelector("#media");
const mediaStage = document.querySelector("#mediaStage");
const stageEmpty = document.querySelector("#stageEmpty");
const audioVisual = document.querySelector("#audioVisual");
const playlistElement = document.querySelector("#playlist");
const playlistEmpty = document.querySelector("#playlistEmpty");
const trackCount = document.querySelector("#trackCount");
const trackTitle = document.querySelector("#trackTitle");
const trackSource = document.querySelector("#trackSource");
const mediaBadge = document.querySelector("#mediaBadge");
const statusMessage = document.querySelector("#statusMessage");
const appVersion = document.querySelector("#appVersion");
const progressBar = document.querySelector("#progressBar");
const currentTime = document.querySelector("#currentTime");
const duration = document.querySelector("#duration");
const volumeSlider = document.querySelector("#volumeSlider");
const volumeValue = document.querySelector("#volumeValue");
const speedSelect = document.querySelector("#speedSelect");
const playButton = document.querySelector("#playButton");
const muteButton = document.querySelector("#muteButton");
const urlPanel = document.querySelector("#urlPanel");
const urlForm = document.querySelector("#urlForm");
const urlInput = document.querySelector("#urlInput");
const urlType = document.querySelector("#urlType");
const visualizerCanvas = document.querySelector("#visualizerCanvas");
const visualizerContext = visualizerCanvas.getContext("2d");

let playlist = [];
let activeIndex = -1;
let isSeeking = false;
let pendingSeekTime = null;
let committedSeekTime = null;
let previousVolume = 0.8;
let audioContext;
let analyser;
let capturedSource;
let visualizerFrame;

const audioExtensions = new Set(["mp3", "wav", "ogg", "m4a", "aac"]);
const videoExtensions = new Set(["mp4", "webm", "ogv", "mov"]);

media.volume = Number(volumeSlider.value);

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    };
    return entities[character];
  });
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = String(totalSeconds % 60).padStart(2, "0");

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainingSeconds}`
    : `${minutes}:${remainingSeconds}`;
}

function extensionFrom(value) {
  try {
    const pathname = value.startsWith("http") ? new URL(value).pathname : value;
    return pathname.split(".").pop()?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}

function inferKind(value, forcedKind = "auto") {
  if (forcedKind !== "auto") return forcedKind;
  const extension = extensionFrom(value);
  return audioExtensions.has(extension) ? "audio" : "video";
}

function readableNameFromUrl(value) {
  try {
    const pathname = new URL(value).pathname;
    const lastPart = pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(lastPart || new URL(value).hostname);
  } catch {
    return "Remote media";
  }
}

function setStatus(message, state = "normal") {
  statusMessage.textContent = message;
  statusMessage.dataset.state = state;
}

function drawVisualizer() {
  if (!analyser || !visualizerContext) return;

  const values = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(values);

  const width = visualizerCanvas.width;
  const height = visualizerCanvas.height;
  const gap = 4;
  const barWidth = Math.max(3, width / values.length - gap);
  visualizerContext.clearRect(0, 0, width, height);
  const gradient = visualizerContext.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, "#8b5cf6");
  gradient.addColorStop(1, "#39d8ff");
  visualizerContext.fillStyle = gradient;

  values.forEach((value, index) => {
    const barHeight = Math.max(3, (value / 255) * (height - 6));
    visualizerContext.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight);
  });

  visualizerFrame = requestAnimationFrame(drawVisualizer);
}

async function startVisualizer() {
  if (playlist[activeIndex]?.kind !== "audio" || capturedSource || !media.captureStream) return;

  try {
    const stream = media.captureStream();
    if (!stream.getAudioTracks().length) return;

    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.82;
    capturedSource = audioContext.createMediaStreamSource(stream);
    capturedSource.connect(analyser);
    drawVisualizer();
  } catch {
    // Playback remains available even when a remote server blocks analysis.
  }
}

function resetVisualizer() {
  if (visualizerFrame) cancelAnimationFrame(visualizerFrame);
  visualizerFrame = undefined;
  capturedSource?.disconnect();
  capturedSource = undefined;
  analyser = undefined;
  audioContext?.close();
  audioContext = undefined;
  visualizerContext?.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
}

function updatePlayButton() {
  const isPlaying = !media.paused && !media.ended;
  document.body.classList.toggle("is-playing", isPlaying);
  playButton.title = isPlaying ? "Pause" : "Play";
  playButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

function updateProgress() {
  if (isSeeking) return;
  const ratio = Number.isFinite(media.duration) && media.duration > 0
    ? media.currentTime / media.duration
    : 0;
  progressBar.value = String(Math.round(ratio * 1000));
  currentTime.textContent = formatTime(media.currentTime);
}

function updateDuration() {
  duration.textContent = formatTime(media.duration);
  progressBar.disabled = !Number.isFinite(media.duration) || media.duration <= 0;
}

function seekTo(timeInSeconds) {
  if (!Number.isFinite(timeInSeconds)) return false;

  if (!Number.isFinite(media.duration) || media.duration <= 0) {
    pendingSeekTime = Math.max(0, timeInSeconds);
    return false;
  }

  const targetTime = Math.min(Math.max(timeInSeconds, 0), media.duration);
  pendingSeekTime = null;
  committedSeekTime = targetTime;
  isSeeking = true;

  try {
    if (Math.abs(media.currentTime - targetTime) < 0.01) {
      committedSeekTime = null;
      isSeeking = false;
      updateProgress();
      return true;
    }

    media.currentTime = targetTime;
    currentTime.textContent = formatTime(targetTime);
    return true;
  } catch {
    pendingSeekTime = targetTime;
    committedSeekTime = null;
    isSeeking = false;
    return false;
  }
}

function timeFromProgressBar() {
  if (!Number.isFinite(media.duration) || media.duration <= 0) return null;
  return (Number(progressBar.value) / Number(progressBar.max)) * media.duration;
}

function previewProgressBar() {
  const targetTime = timeFromProgressBar();
  if (targetTime !== null) currentTime.textContent = formatTime(targetTime);
}

function commitProgressBarSeek() {
  const targetTime = timeFromProgressBar();
  if (targetTime === null) {
    isSeeking = false;
    return;
  }

  seekTo(targetTime);
}

function updateStage(track) {
  const isAudio = track?.kind === "audio";
  stageEmpty.hidden = Boolean(track);
  media.hidden = !track || isAudio;
  audioVisual.hidden = !isAudio;
  mediaStage.classList.toggle("audio-mode", isAudio);
  mediaStage.classList.toggle("has-media", Boolean(track));
}

function renderPlaylist() {
  trackCount.textContent = String(playlist.length);
  playlistEmpty.hidden = playlist.length > 0;

  playlistElement.innerHTML = playlist
    .map((track, index) => {
      const activeClass = index === activeIndex ? "is-active" : "";
      const icon = track.kind === "audio" ? "♫" : "▶";
      const sourceLabel = track.source === "url" ? "URL" : track.kind.toUpperCase();

      return `
        <article class="playlist-item ${activeClass}" data-index="${index}">
          <button class="playlist-main" type="button" data-action="play" data-index="${index}">
            <span class="track-icon">${icon}</span>
            <span class="playlist-copy">
              <strong>${escapeHtml(track.name)}</strong>
              <small>${sourceLabel}</small>
            </span>
          </button>
          <button class="remove-button" type="button" data-action="remove" data-index="${index}" aria-label="Remove ${escapeHtml(track.name)}" title="Remove">×</button>
        </article>
      `;
    })
    .join("");
}

function addTracks(tracks) {
  if (!tracks.length) return;

  const startIndex = playlist.length;
  playlist.push(...tracks);
  renderPlaylist();
  setStatus(`${tracks.length} media file${tracks.length === 1 ? "" : "s"} added`);

  if (activeIndex === -1) {
    loadTrack(startIndex);
  }
}

function loadTrack(index) {
  if (!playlist[index]) return;

  activeIndex = index;
  const track = playlist[index];
  isSeeking = false;
  pendingSeekTime = null;
  committedSeekTime = null;
  resetVisualizer();
  media.pause();
  media.removeAttribute("src");
  media.load();
  media.src = track.url;
  media.playbackRate = Number(speedSelect.value);
  media.load();

  trackTitle.textContent = track.name;
  trackSource.textContent = track.source === "url" ? track.url : "Local media file";
  mediaBadge.textContent = track.kind === "audio" ? "Audio" : "Video";
  progressBar.value = "0";
  progressBar.disabled = true;
  currentTime.textContent = "0:00";
  duration.textContent = "0:00";
  updateStage(track);
  renderPlaylist();
  setStatus(`Loaded: ${track.name}`);

}

function removeTrack(index) {
  if (!playlist[index]) return;

  const removedActiveTrack = index === activeIndex;
  const removedName = playlist[index].name;
  const [removedTrack] = playlist.splice(index, 1);

  if (removedTrack.source === "drop" && removedTrack.url.startsWith("blob:")) {
    URL.revokeObjectURL(removedTrack.url);
  }

  if (!playlist.length) {
    activeIndex = -1;
    media.pause();
    media.removeAttribute("src");
    media.load();
    trackTitle.textContent = "Nothing selected";
    trackSource.textContent = "Open a local file or direct URL";
    mediaBadge.textContent = "Ready";
    updateStage(null);
  } else if (removedActiveTrack) {
    loadTrack(Math.min(index, playlist.length - 1));
  } else if (index < activeIndex) {
    activeIndex -= 1;
  }

  renderPlaylist();
  setStatus(`Removed: ${removedName}`);
}

async function openLocalFiles() {
  if (!window.pulseAPI) {
    setStatus("Native file dialog is available in the Electron application", "error");
    return;
  }

  const tracks = await window.pulseAPI.openMediaFiles();
  addTracks(tracks);
}

function togglePlayback() {
  if (activeIndex === -1) {
    openLocalFiles();
    return;
  }

  if (media.paused || media.ended) {
    media.play().catch(() => setStatus("Playback could not be started", "error"));
  } else {
    media.pause();
  }
}

function stopPlayback() {
  media.pause();
  seekTo(0);
  updateProgress();
  setStatus("Playback stopped");
}

function seekBy(seconds) {
  if (!Number.isFinite(media.duration)) return;
  const baseTime = committedSeekTime ?? media.currentTime;
  seekTo(baseTime + seconds);
}

function changeTrack(direction) {
  if (!playlist.length) return;
  const nextIndex = (activeIndex + direction + playlist.length) % playlist.length;
  loadTrack(nextIndex);
}

document.querySelector("#openFilesButton").addEventListener("click", openLocalFiles);
document.querySelector("#emptyOpenButton").addEventListener("click", openLocalFiles);
document.querySelector("#toggleUrlButton").addEventListener("click", () => {
  urlPanel.hidden = !urlPanel.hidden;
  if (!urlPanel.hidden) urlInput.focus();
});

urlForm.addEventListener("submit", (event) => {
  event.preventDefault();

  try {
    const url = new URL(urlInput.value.trim());
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported protocol");

    addTracks([
      {
        id: crypto.randomUUID(),
        name: readableNameFromUrl(url.href),
        url: url.href,
        kind: inferKind(url.href, urlType.value),
        source: "url"
      }
    ]);

    urlForm.reset();
    urlPanel.hidden = true;
  } catch {
    setStatus("Enter a valid direct HTTP or HTTPS media URL", "error");
    urlInput.focus();
  }
});

playlistElement.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const index = Number(button.dataset.index);
  if (button.dataset.action === "play") loadTrack(index);
  if (button.dataset.action === "remove") removeTrack(index);
});

playButton.addEventListener("click", togglePlayback);
document.querySelector("#stopButton").addEventListener("click", stopPlayback);
document.querySelector("#rewindButton").addEventListener("click", () => seekBy(-10));
document.querySelector("#forwardButton").addEventListener("click", () => seekBy(10));
document.querySelector("#previousButton").addEventListener("click", () => changeTrack(-1));
document.querySelector("#nextButton").addEventListener("click", () => changeTrack(1));

progressBar.addEventListener("pointerdown", () => {
  isSeeking = true;
});

progressBar.addEventListener("input", () => {
  isSeeking = true;
  previewProgressBar();
});

function finishSeeking() {
  commitProgressBarSeek();
}

progressBar.addEventListener("change", finishSeeking);
progressBar.addEventListener("pointerup", () => {
  queueMicrotask(() => {
    if (committedSeekTime === null) finishSeeking();
  });
});
progressBar.addEventListener("pointercancel", finishSeeking);
progressBar.addEventListener("blur", () => {
  if (isSeeking) finishSeeking();
});

volumeSlider.addEventListener("input", () => {
  media.volume = Number(volumeSlider.value);
  media.muted = media.volume === 0;
  volumeValue.textContent = `${Math.round(media.volume * 100)}%`;
});

muteButton.addEventListener("click", () => {
  if (media.muted || media.volume === 0) {
    media.muted = false;
    media.volume = previousVolume || 0.8;
    volumeSlider.value = String(media.volume);
  } else {
    previousVolume = media.volume;
    media.muted = true;
  }
  volumeValue.textContent = media.muted ? "Muted" : `${Math.round(media.volume * 100)}%`;
});

speedSelect.addEventListener("change", () => {
  media.playbackRate = Number(speedSelect.value);
  setStatus(`Playback speed: ${speedSelect.value}×`);
});

document.querySelector("#fullscreenButton").addEventListener("click", async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await mediaStage.requestFullscreen();
  }
});

media.addEventListener("play", () => {
  updatePlayButton();
  setStatus(`Playing: ${playlist[activeIndex]?.name ?? "media"}`);
  startVisualizer();
});
media.addEventListener("pause", updatePlayButton);
media.addEventListener("timeupdate", updateProgress);
media.addEventListener("loadedmetadata", () => {
  updateDuration();
  if (pendingSeekTime !== null) seekTo(pendingSeekTime);
  setStatus("Media is ready");
});
media.addEventListener("seeked", () => {
  committedSeekTime = null;
  isSeeking = false;
  updateProgress();
});
media.addEventListener("loadeddata", () => {
  if (!media.paused) startVisualizer();
});
media.addEventListener("durationchange", updateDuration);
media.addEventListener("volumechange", () => {
  volumeValue.textContent = media.muted ? "Muted" : `${Math.round(media.volume * 100)}%`;
});
media.addEventListener("ended", () => {
  updatePlayButton();
  if (playlist.length > 1) changeTrack(1);
});
media.addEventListener("error", () => {
  const message = playlist[activeIndex]?.source === "url"
    ? "The URL could not be played. Check that it is a direct media link."
    : "This file or codec is not supported.";
  setStatus(message, "error");
});

document.addEventListener("keydown", (event) => {
  const activeElement = document.activeElement;
  const isEditing = ["INPUT", "SELECT", "TEXTAREA"].includes(activeElement?.tagName)
    && activeElement !== progressBar;
  if (isEditing) return;

  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  }
  if (event.code === "ArrowLeft") {
    event.preventDefault();
    seekBy(-10);
  }
  if (event.code === "ArrowRight") {
    event.preventDefault();
    seekBy(10);
  }
  if (event.code === "ArrowUp") {
    event.preventDefault();
    media.volume = Math.min(media.volume + 0.05, 1);
    volumeSlider.value = String(media.volume);
  }
  if (event.code === "ArrowDown") {
    event.preventDefault();
    media.volume = Math.max(media.volume - 0.05, 0);
    volumeSlider.value = String(media.volume);
  }
});

document.addEventListener("dragover", (event) => {
  event.preventDefault();
  document.body.classList.add("is-dragging");
});

document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) document.body.classList.remove("is-dragging");
});

document.addEventListener("drop", (event) => {
  event.preventDefault();
  document.body.classList.remove("is-dragging");

  const tracks = [...event.dataTransfer.files]
    .filter((file) => {
      const extension = extensionFrom(file.name);
      return audioExtensions.has(extension) || videoExtensions.has(extension);
    })
    .map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
      kind: inferKind(file.name),
      source: "drop"
    }));

  addTracks(tracks);
});

window.addEventListener("beforeunload", () => {
  resetVisualizer();
  playlist
    .filter((track) => track.source === "drop" && track.url.startsWith("blob:"))
    .forEach((track) => URL.revokeObjectURL(track.url));
});

if (window.pulseAPI) {
  window.pulseAPI.getVersion().then((version) => {
    appVersion.textContent = `Pulse Media Player v${version}`;
  });
}

updateStage(null);
renderPlaylist();
updatePlayButton();
