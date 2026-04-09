// UN World Population Prospects 2024, World, Medium, 2025.
const BASE_POPULATION = 8_231_613_070;
const BASE_TIMESTAMP = Date.parse("2025-07-01T00:00:00.000Z");
const CRUDE_BIRTH_RATE = 16.084 / 1000;
const CRUDE_DEATH_RATE = 7.67 / 1000;
const MS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000;
const UPDATE_INTERVAL_MS = 3000;
const TRANSITION_MS = 650;

const BIRTHS_PER_YEAR = BASE_POPULATION * CRUDE_BIRTH_RATE;
const DEATHS_PER_YEAR = BASE_POPULATION * CRUDE_DEATH_RATE;

const stageNode = document.querySelector(".stage");
const lineNode = document.querySelector(".line");
const populationNode = document.querySelector("[data-population]");
const formatter = new Intl.NumberFormat("en-US");

let currentValue = getPopulationEstimate();
let animationFrameId = 0;
let cycleTimeoutId = 0;

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

function resetCycle() {
  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
  }

  if (cycleTimeoutId) {
    window.clearTimeout(cycleTimeoutId);
    cycleTimeoutId = 0;
  }

  currentValue = getPopulationEstimate();
  renderPopulation(currentValue);
  scheduleNextCycle();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    resetCycle();
  }
});

window.addEventListener("resize", fitLine);

renderPopulation(currentValue);
scheduleNextCycle();
