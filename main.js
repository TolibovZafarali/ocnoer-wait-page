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
const lineNode = document.querySelector(".line");
const copyNodes = Array.from(document.querySelectorAll("[data-copy]"));
const populationNode = document.querySelector("[data-population]");
const formatter = new Intl.NumberFormat("en-US");

let currentValue = getPopulationEstimate();
let animationFrameId = 0;
let cycleTimeoutId = 0;
let copyTimeoutId = 0;
let copyEntryTimeoutId = 0;
let copyCleanupTimeoutId = 0;
let activeCopyIndex = 0;

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

  const availableWidth = stageNode.clientWidth;
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
    clearCycle();
    setActiveCopy(activeCopyIndex);
    return;
  }

  resetCycle();
});

window.addEventListener("resize", fitLine);

renderPopulation(currentValue);
scheduleNextCycle();
setActiveCopy(activeCopyIndex);
scheduleCopyCycle();

if (document.fonts?.ready) {
  document.fonts.ready.then(fitLine);
}
