// UN World Population Prospects 2024, World, Medium, 2025.
const BASE_POPULATION = 8_231_613_070;
const BASE_TIMESTAMP = Date.parse("2025-07-01T00:00:00.000Z");
const CRUDE_BIRTH_RATE = 16.084 / 1000;
const CRUDE_DEATH_RATE = 7.67 / 1000;
const MS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000;
const UPDATE_INTERVAL_MS = 3000;
const TRANSITION_MS = 650;
const COPY_HOLD_MS = 4200;
const COPY_ENTRY_DELAY_MS = 120;
const COPY_TRANSITION_MS = 1500;

const BIRTHS_PER_YEAR = BASE_POPULATION * CRUDE_BIRTH_RATE;
const DEATHS_PER_YEAR = BASE_POPULATION * CRUDE_DEATH_RATE;

const stageNode = document.querySelector(".stage");
const contentNode = document.querySelector(".content");
const lineNode = document.querySelector(".line");
const copyNodes = Array.from(document.querySelectorAll("[data-copy]"));
const populationNode = document.querySelector("[data-population]");
const audioNode = document.querySelector("[data-audio]");
const audioProgressNode = document.querySelector("[data-audio-progress]");
const audioPromptNode = document.querySelector("[data-audio-prompt]");
const AUDIO_PROGRESS_RADIUS = Number(audioProgressNode?.getAttribute("r") ?? 0);
const AUDIO_PROGRESS_LENGTH = 2 * Math.PI * AUDIO_PROGRESS_RADIUS;
const formatter = new Intl.NumberFormat("en-US");

let currentValue = getPopulationEstimate();
let animationFrameId = 0;
let cycleTimeoutId = 0;
let copyTimeoutId = 0;
let copyEntryTimeoutId = 0;
let copyCleanupTimeoutId = 0;
let activeCopyIndex = 0;
let audioFrameId = 0;
let shouldResumeAudio = false;

function getPopulationEstimate(now = Date.now()) {
  const elapsedYears = (now - BASE_TIMESTAMP) / MS_PER_YEAR;
  const birthsSinceBase = BIRTHS_PER_YEAR * elapsedYears;
  const deathsSinceBase = DEATHS_PER_YEAR * elapsedYears;

  return BASE_POPULATION + birthsSinceBase - deathsSinceBase;
}

function fitLine() {
  if (!stageNode || !lineNode) {
    return;
  }

  const availableWidth = contentNode?.clientWidth ?? stageNode.clientWidth;
  const idealSize = Math.min(Math.max(window.innerWidth * 0.0285, 16), 76);

  lineNode.style.fontSize = `${idealSize}px`;

  if (lineNode.scrollWidth > availableWidth) {
    const fittedSize = Math.max((idealSize * availableWidth) / lineNode.scrollWidth, 12);
    lineNode.style.fontSize = `${fittedSize}px`;
  }
}

function renderPopulation(value) {
  if (!populationNode) {
    return;
  }

  populationNode.textContent = formatter.format(Math.round(value));
  fitLine();
}

function ease(progress) {
  return -(Math.cos(Math.PI * progress) - 1) / 2;
}

function animateTransition(fromValue, toValue) {
  const startTime = performance.now();

  const step = (now) => {
    const progress = Math.min((now - startTime) / TRANSITION_MS, 1);
    const nextValue = fromValue + (toValue - fromValue) * ease(progress);

    renderPopulation(nextValue);

    if (progress < 1) {
      animationFrameId = window.requestAnimationFrame(step);
      return;
    }

    currentValue = toValue;
    animationFrameId = 0;
    scheduleNextCycle();
  };

  animationFrameId = window.requestAnimationFrame(step);
}

function scheduleNextCycle() {
  const delayUntilNextTick = UPDATE_INTERVAL_MS - (Date.now() % UPDATE_INTERVAL_MS);

  cycleTimeoutId = window.setTimeout(() => {
    const nextValue = getPopulationEstimate();
    animateTransition(currentValue, nextValue);
  }, delayUntilNextTick);
}

function setActiveCopy(nextIndex) {
  activeCopyIndex = nextIndex;

  copyNodes.forEach((node, index) => {
    const isActive = index === activeCopyIndex;

    node.classList.toggle("is-visible", isActive);
    node.classList.remove("is-exiting");
    node.setAttribute("aria-hidden", String(!isActive));
  });
}

function scheduleCopyCycle() {
  if (copyNodes.length < 2) {
    return;
  }

  copyTimeoutId = window.setTimeout(() => {
    const nextIndex = (activeCopyIndex + 1) % copyNodes.length;
    const currentNode = copyNodes[activeCopyIndex];
    const nextNode = copyNodes[nextIndex];

    activeCopyIndex = nextIndex;
    currentNode.classList.remove("is-visible");
    currentNode.classList.add("is-exiting");
    currentNode.setAttribute("aria-hidden", "true");
    nextNode.classList.remove("is-exiting");

    copyEntryTimeoutId = window.setTimeout(() => {
      nextNode.classList.add("is-visible");
      nextNode.setAttribute("aria-hidden", "false");
    }, COPY_ENTRY_DELAY_MS);

    copyCleanupTimeoutId = window.setTimeout(() => {
      currentNode.classList.remove("is-exiting");
      scheduleCopyCycle();
    }, COPY_TRANSITION_MS);
  }, COPY_HOLD_MS);
}

function clearCycle() {
  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
  }

  if (cycleTimeoutId) {
    window.clearTimeout(cycleTimeoutId);
    cycleTimeoutId = 0;
  }

  if (copyTimeoutId) {
    window.clearTimeout(copyTimeoutId);
    copyTimeoutId = 0;
  }

  if (copyEntryTimeoutId) {
    window.clearTimeout(copyEntryTimeoutId);
    copyEntryTimeoutId = 0;
  }

  if (copyCleanupTimeoutId) {
    window.clearTimeout(copyCleanupTimeoutId);
    copyCleanupTimeoutId = 0;
  }
}

function setAudioPromptVisible(isVisible) {
  if (!audioPromptNode) {
    return;
  }

  audioPromptNode.hidden = !isVisible;
}

function getAudioProgress() {
  if (!audioNode) {
    return 0;
  }

  if (audioNode.ended) {
    return 1;
  }

  if (!Number.isFinite(audioNode.duration) || audioNode.duration <= 0) {
    return 0;
  }

  return audioNode.currentTime / audioNode.duration;
}

function renderAudioProgress(progress) {
  if (!audioProgressNode || !AUDIO_PROGRESS_LENGTH) {
    return;
  }

  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const visibleLength = AUDIO_PROGRESS_LENGTH * clampedProgress;

  audioProgressNode.style.opacity = clampedProgress <= 0.001 ? "0" : "1";
  audioProgressNode.style.strokeDasharray = `${visibleLength} ${AUDIO_PROGRESS_LENGTH}`;
}

function initializeAudioProgressRing() {
  if (!audioProgressNode || !AUDIO_PROGRESS_LENGTH) {
    return;
  }

  audioProgressNode.style.strokeDashoffset = "0";
  renderAudioProgress(0);
}

function stopAudioProgressLoop() {
  if (!audioFrameId) {
    return;
  }

  window.cancelAnimationFrame(audioFrameId);
  audioFrameId = 0;
}

function startAudioProgressLoop() {
  if (!audioNode) {
    return;
  }

  stopAudioProgressLoop();

  const updateProgress = () => {
    renderAudioProgress(getAudioProgress());

    if (audioNode.paused || audioNode.ended) {
      audioFrameId = 0;
      return;
    }

    audioFrameId = window.requestAnimationFrame(updateProgress);
  };

  audioFrameId = window.requestAnimationFrame(updateProgress);
}

async function attemptAudioPlayback({ showPromptOnFailure = true } = {}) {
  if (!audioNode || audioNode.ended) {
    return false;
  }

  try {
    await audioNode.play();
    shouldResumeAudio = true;
    setAudioPromptVisible(false);
    startAudioProgressLoop();
    return true;
  } catch (error) {
    stopAudioProgressLoop();
    renderAudioProgress(getAudioProgress());

    if (showPromptOnFailure) {
      setAudioPromptVisible(true);
    }

    return false;
  }
}

function resetCycle() {
  clearCycle();
  currentValue = getPopulationEstimate();
  renderPopulation(currentValue);
  setActiveCopy(activeCopyIndex);
  scheduleNextCycle();
  scheduleCopyCycle();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    shouldResumeAudio = Boolean(audioNode && !audioNode.paused && !audioNode.ended);

    if (shouldResumeAudio) {
      audioNode.pause();
    }

    clearCycle();
    setActiveCopy(activeCopyIndex);
    return;
  }

  resetCycle();

  if (shouldResumeAudio && audioNode && !audioNode.ended) {
    void attemptAudioPlayback({ showPromptOnFailure: false });
  }
});

window.addEventListener("resize", fitLine);

if (audioPromptNode) {
  audioPromptNode.addEventListener("click", () => {
    void attemptAudioPlayback();
  });
}

if (audioNode) {
  audioNode.addEventListener("loadedmetadata", () => {
    renderAudioProgress(getAudioProgress());
  });

  audioNode.addEventListener("durationchange", () => {
    renderAudioProgress(getAudioProgress());
  });

  audioNode.addEventListener("timeupdate", () => {
    renderAudioProgress(getAudioProgress());
  });

  audioNode.addEventListener("play", () => {
    setAudioPromptVisible(false);
    startAudioProgressLoop();
  });

  audioNode.addEventListener("pause", () => {
    stopAudioProgressLoop();
    renderAudioProgress(getAudioProgress());
  });

  audioNode.addEventListener("ended", () => {
    shouldResumeAudio = false;
    stopAudioProgressLoop();
    renderAudioProgress(1);
    setAudioPromptVisible(false);
  });
}

renderPopulation(currentValue);
scheduleNextCycle();
setActiveCopy(activeCopyIndex);
scheduleCopyCycle();
initializeAudioProgressRing();

if (audioNode) {
  void attemptAudioPlayback();
}

if (document.fonts?.ready) {
  document.fonts.ready.then(fitLine);
}
