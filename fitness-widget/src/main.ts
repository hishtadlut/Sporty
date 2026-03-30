import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface Exercise {
  id: number;
  name: string;
  split_key: string;
  split_order: number;
  is_bodyweight: boolean;
  level: number;
  points: number;
  points_to_next_level: number;
  baseline_volume: number;
}

interface HomeState {
  current_split: string;
  is_rest_day_today: boolean;
  current_split_exercises: Exercise[];
  all_exercises: Exercise[];
}

interface GhostSet {
  set_number: number;
  weight: number;
  reps: number;
}

interface GhostWorkout {
  date: string;
  total_volume: number;
  is_pr: boolean;
  sets: GhostSet[];
}

interface ExerciseHistoryEntry {
  date: string;
  total_volume: number;
  points_earned: number;
  is_pr: boolean;
}

interface ExerciseInsights {
  last_workout: GhostWorkout | null;
  history: ExerciseHistoryEntry[];
}

interface WorkoutSummary {
  total_volume: number;
  earned_points: number;
  level: number;
  points: number;
  points_to_next_level: number;
  exercise_streak: number;
  is_pr: boolean;
}

interface SetInput {
  weight: number;
  reps: number;
}

type PreviousScreen = "home" | "all";

let homeState: HomeState | null = null;
let currentExercise: Exercise | null = null;
let currentInsights: ExerciseInsights = { last_workout: null, history: [] };
let currentSets: SetInput[] = [{ weight: 0, reps: 0 }];
let lastSummary: WorkoutSummary | null = null;
let lastSavedExercise: Exercise | null = null;
let timerInterval: number | null = null;
let secondsElapsed = 0;
let toastTimeout: number | null = null;
let showAllExercises = false;
let previousScreen: PreviousScreen = "home";

const app = document.querySelector<HTMLDivElement>("#app")!;
const toastRoot = document.querySelector<HTMLDivElement>("#toast-root")!;
const appWindow = getCurrentWindow();

const splitContent = {
  A: {
    title: "Workout A",
    subtitle: "Upper focus. Rows, presses, shoulders, curls.",
    tone: "Pull, press, and width.",
  },
  B: {
    title: "Workout B",
    subtitle: "Lower body and triceps. Glutes, legs, extension.",
    tone: "Drive, hinge, and finish hard.",
  },
} as const;

async function loadDashboard(): Promise<void> {
  homeState = await invoke<HomeState>("get_home_state");
  render();
}

function render(): void {
  if (currentExercise) {
    renderLogView();
  } else if (showAllExercises) {
    renderAllExercisesView();
  } else {
    renderOverview();
  }

  renderToast();
}

function renderOverview(): void {
  if (!homeState) {
    app.innerHTML = `<section class="widget-frame loading-frame">Loading...</section>`;
    return;
  }

  const splitKey = homeState.current_split as "A" | "B";
  const split = splitContent[splitKey];

  app.innerHTML = `
    <section class="widget-frame">
      <header class="hero-panel split-hero split-${splitKey.toLowerCase()}">
        <div class="hero-copy">
          <div class="eyebrow">Alternating Split Widget</div>
          <h1>${split.title}</h1>
          <p>${split.subtitle}</p>
        </div>
        <button class="chrome-button" id="hide-widget" aria-label="Hide widget">Hide</button>
        <div class="hero-metrics">
          <div class="metric-card">
            <span>Current Split</span>
            <strong>${splitKey}</strong>
            <small>${split.tone}</small>
          </div>
          <div class="metric-card">
            <span>Today</span>
            <strong>${formatToday()}</strong>
            <small>${homeState.is_rest_day_today ? "Rest day marked manually" : "Train or rest by choice"}</small>
          </div>
        </div>
        <div class="hero-actions">
          <button class="secondary-action" id="view-all">All Exercises</button>
          <button class="ghost-action ${homeState.is_rest_day_today ? "ghost-action-active" : ""}" id="mark-rest">
            ${homeState.is_rest_day_today ? "Rest Day Active" : "Mark Rest Day"}
          </button>
          <button class="primary-action" id="complete-split">Complete Split</button>
        </div>
      </header>

      ${
        homeState.is_rest_day_today
          ? `
        <section class="section-block notice-panel">
          <div class="section-head">
            <div>
              <h2>Rest Is Logged</h2>
              <p>Today is marked as rest. The same ${split.title} stays pending until you decide to complete it.</p>
            </div>
          </div>
        </section>
      `
          : ""
      }

      <section class="section-block">
        <div class="section-head">
          <div>
            <h2>${split.title}</h2>
            <p>These six stay on deck until you manually advance to the next split.</p>
          </div>
        </div>
        <div class="exercise-grid">
          ${homeState.current_split_exercises.map((exercise) => renderExerciseCard(exercise, "current")).join("")}
        </div>
      </section>
    </section>
  `;

  bindCommonHomeActions();
  bindExerciseCards();

  document.querySelector<HTMLButtonElement>("#view-all")?.addEventListener("click", () => {
    showAllExercises = true;
    render();
  });

  document.querySelector<HTMLButtonElement>("#mark-rest")?.addEventListener("click", () => {
    void handleRestDay();
  });

  document.querySelector<HTMLButtonElement>("#complete-split")?.addEventListener("click", () => {
    void handleCompleteSplit();
  });
}

function renderAllExercisesView(): void {
  if (!homeState) {
    app.innerHTML = `<section class="widget-frame loading-frame">Loading...</section>`;
    return;
  }

  const splitA = homeState.all_exercises.filter((exercise) => exercise.split_key === "A");
  const splitB = homeState.all_exercises.filter((exercise) => exercise.split_key === "B");

  app.innerHTML = `
    <section class="widget-frame">
      <header class="log-hero">
        <button class="back-button" id="back-to-home" aria-label="Back">Back</button>
        <div class="log-head-copy">
          <div class="eyebrow">Optional Logging</div>
          <h1>All Exercises</h1>
          <p>Open anything without changing the current split.</p>
        </div>
        <button class="chrome-button" id="hide-widget" aria-label="Hide widget">Hide</button>
      </header>

      <section class="section-block">
        <div class="section-head">
          <div>
            <h2>Workout A</h2>
            <p>Upper-body pull and press lineup.</p>
          </div>
        </div>
        <div class="exercise-grid all-grid">
          ${splitA.map((exercise) => renderExerciseCard(exercise, "all")).join("")}
        </div>
      </section>

      <section class="section-block">
        <div class="section-head">
          <div>
            <h2>Workout B</h2>
            <p>Lower-body drive plus triceps finishers.</p>
          </div>
        </div>
        <div class="exercise-grid all-grid">
          ${splitB.map((exercise) => renderExerciseCard(exercise, "all")).join("")}
        </div>
      </section>
    </section>
  `;

  document.querySelector<HTMLButtonElement>("#hide-widget")?.addEventListener("click", () => {
    void appWindow.hide();
  });
  document.querySelector<HTMLButtonElement>("#back-to-home")?.addEventListener("click", () => {
    showAllExercises = false;
    render();
  });
  bindExerciseCards();
}

function renderExerciseCard(exercise: Exercise, mode: "current" | "all"): string {
  const isScheduled = homeState?.current_split === exercise.split_key;
  const progress = Math.min(
    100,
    Math.max(6, (exercise.points / exercise.points_to_next_level) * 100),
  );
  const pointsPrefix = exercise.points > 0 ? "+" : "";

  return `
    <article class="exercise-card ${mode === "current" ? "exercise-card-current" : "exercise-card-library"}" data-open-exercise="${exercise.id}">
      <div class="exercise-card-top">
        <span class="slot-pill ${exercise.split_key === "A" ? "slot-pill-a" : "slot-pill-b"}">
          ${exercise.split_key}${exercise.split_order}
        </span>
        <span class="split-tag">${mode === "current" || isScheduled ? "Scheduled" : "Optional"}</span>
      </div>
      <div class="exercise-title-row">
        <h3>${exercise.name}</h3>
        <button class="launch-button" tabindex="-1">Log</button>
      </div>
      <div class="exercise-meta">
        <div>
          <span>Level</span>
          <strong>${exercise.level}</strong>
        </div>
        <div>
          <span>Points</span>
          <strong class="${exercise.points >= 0 ? "positive-text" : "negative-text"}">${pointsPrefix}${exercise.points.toFixed(1)}</strong>
        </div>
        <div>
          <span>Target</span>
          <strong>${formatBaseline(exercise)}</strong>
        </div>
      </div>
      <div class="progress-bar">
        <span style="width:${progress}%"></span>
      </div>
      <div class="progress-caption">${exercise.points.toFixed(1)} / ${exercise.points_to_next_level.toFixed(1)} toward next level</div>
    </article>
  `;
}

function bindCommonHomeActions(): void {
  document.querySelector<HTMLButtonElement>("#hide-widget")?.addEventListener("click", () => {
    void appWindow.hide();
  });
}

function bindExerciseCards(): void {
  document.querySelectorAll<HTMLElement>("[data-open-exercise]").forEach((element) => {
    element.addEventListener("click", () => {
      const id = Number(element.dataset.openExercise);
      const exercise = homeState?.all_exercises.find((item) => item.id === id);
      if (exercise) {
        void openLogView(exercise);
      }
    });
  });
}

async function handleCompleteSplit(): Promise<void> {
  if (!homeState) {
    return;
  }

  const nextSplit = homeState.current_split === "A" ? "B" : "A";
  const confirmed = window.confirm(`Mark ${formatSplitTitle(homeState.current_split)} complete and move to ${formatSplitTitle(nextSplit)}?`);
  if (!confirmed) {
    return;
  }

  await invoke("complete_split");
  showAllExercises = false;
  await loadDashboard();
}

async function handleRestDay(): Promise<void> {
  await invoke("mark_rest_day");
  await loadDashboard();
}

async function openLogView(exercise: Exercise): Promise<void> {
  previousScreen = showAllExercises ? "all" : "home";
  currentExercise = exercise;
  currentSets = [{ weight: 0, reps: 0 }];
  currentInsights = await invoke<ExerciseInsights>("get_exercise_insights", {
    exerciseId: exercise.id,
  });
  stopRestTimer();
  secondsElapsed = 0;
  render();
}

function renderLogView(): void {
  if (!currentExercise) {
    return;
  }

  const exercise = currentExercise;
  const lastWorkout = currentInsights.last_workout;
  const totalVolume = calculateVolume();

  app.innerHTML = `
    <section class="widget-frame log-frame">
      <header class="log-hero">
        <button class="back-button" id="back-to-list" aria-label="Back">Back</button>
        <div class="log-head-copy">
          <div class="eyebrow">${formatSplitTitle(exercise.split_key)}</div>
          <h1>${exercise.name}</h1>
          <p>Target ${formatBaseline(exercise)}</p>
        </div>
        <button class="chrome-button" id="hide-widget" aria-label="Hide widget">Hide</button>
      </header>

      <section class="summary-ribbon">
        <div class="summary-chip">
          <span>Live Volume</span>
          <strong id="live-volume">${formatVolume(exercise, totalVolume)}</strong>
        </div>
        <div class="summary-chip">
          <span>Rest Timer</span>
          <strong id="rest-timer">${formatTimer(secondsElapsed)}</strong>
        </div>
      </section>

      <section class="ghost-panel">
        <div class="section-head compact-head">
          <div>
            <h2>Ghost Mode</h2>
            <p>Entire previous workout stays visible while you log.</p>
          </div>
        </div>
        ${
          lastWorkout
            ? `
          <div class="ghost-card">
            <div class="ghost-card-head">
              <div>
                <strong>${formatDate(lastWorkout.date)}</strong>
                <span>${formatVolume(exercise, lastWorkout.total_volume)}</span>
              </div>
              ${lastWorkout.is_pr ? '<span class="pr-pill">PR</span>' : ""}
            </div>
            <div class="ghost-sets">
              ${lastWorkout.sets.map((set) => `<span>${formatSet(exercise, set)}</span>`).join("")}
            </div>
          </div>
        `
            : `<div class="empty-state">No previous workout yet. The first one becomes the ghost.</div>`
        }
      </section>

      <section class="history-strip">
        ${
          currentInsights.history.length > 0
            ? currentInsights.history
                .map(
                  (entry) => `
              <article class="history-card">
                <span>${formatDate(entry.date)}</span>
                <strong>${formatVolume(exercise, entry.total_volume)}</strong>
                <small>${entry.points_earned >= 0 ? "+" : ""}${entry.points_earned.toFixed(1)} pts${entry.is_pr ? " - PR" : ""}</small>
              </article>
            `,
                )
                .join("")
            : ""
        }
      </section>

      <section class="sets-panel">
        <div class="section-head compact-head">
          <div>
            <h2>Set Log</h2>
            <p>Warmups and work sets can be anything. Log as much as you need.</p>
          </div>
        </div>
        <div class="sets-list" id="sets-list">
          ${currentSets.map((set, index) => renderSetRow(exercise, set, index)).join("")}
        </div>
      </section>

      <section class="log-actions">
        <button class="secondary-action" id="next-set">Log Set + Next</button>
        <button class="ghost-action" id="reset-rest">Reset Rest</button>
        <button class="primary-action" id="finish-exercise">Finish Exercise</button>
      </section>
    </section>
  `;

  document.querySelector<HTMLButtonElement>("#hide-widget")?.addEventListener("click", () => {
    void appWindow.hide();
  });
  document.querySelector<HTMLButtonElement>("#back-to-list")?.addEventListener("click", closeLogView);
  document.querySelector<HTMLButtonElement>("#next-set")?.addEventListener("click", addNextSet);
  document.querySelector<HTMLButtonElement>("#reset-rest")?.addEventListener("click", () => {
    restartRestTimer();
  });
  document.querySelector<HTMLButtonElement>("#finish-exercise")?.addEventListener("click", () => {
    void finishExercise();
  });

  document.querySelectorAll<HTMLInputElement>(".set-input").forEach((input) => {
    input.addEventListener("input", onSetInputChange);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-remove-set]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeSet);
      removeSet(index);
    });
  });
}

function renderSetRow(exercise: Exercise, set: SetInput, index: number): string {
  return `
    <article class="set-row">
      <div class="set-index">${index + 1}</div>
      <div class="set-fields">
        ${
          exercise.is_bodyweight
            ? `
          <label class="field-group wide-field">
            <span>Reps</span>
            <input
              class="set-input"
              type="number"
              min="0"
              data-index="${index}"
              data-field="reps"
              value="${set.reps || ""}"
              placeholder="0"
            />
          </label>
        `
            : `
          <label class="field-group">
            <span>KG</span>
            <input
              class="set-input"
              type="number"
              min="0"
              step="0.5"
              data-index="${index}"
              data-field="weight"
              value="${set.weight || ""}"
              placeholder="0"
            />
          </label>
          <label class="field-group">
            <span>Reps</span>
            <input
              class="set-input"
              type="number"
              min="0"
              data-index="${index}"
              data-field="reps"
              value="${set.reps || ""}"
              placeholder="0"
            />
          </label>
        `
        }
      </div>
      <button class="remove-set" data-remove-set="${index}" aria-label="Remove set">Delete</button>
    </article>
  `;
}

function onSetInputChange(event: Event): void {
  const target = event.currentTarget as HTMLInputElement;
  const index = Number(target.dataset.index);
  const field = target.dataset.field;
  const value = Number(target.value) || 0;

  if (field === "weight") {
    currentSets[index].weight = value;
  }

  if (field === "reps") {
    currentSets[index].reps = Math.max(0, Math.floor(value));
  }

  const volume = document.querySelector<HTMLElement>("#live-volume");
  if (currentExercise && volume) {
    volume.textContent = formatVolume(currentExercise, calculateVolume());
  }
}

function addNextSet(): void {
  if (!isSetComplete(currentSets[currentSets.length - 1], currentExercise)) {
    return;
  }

  currentSets = [...currentSets, { weight: 0, reps: 0 }];
  restartRestTimer();
  render();
}

function removeSet(index: number): void {
  if (currentSets.length === 1) {
    currentSets = [{ weight: 0, reps: 0 }];
  } else {
    currentSets = currentSets.filter((_, itemIndex) => itemIndex !== index);
  }

  render();
}

async function finishExercise(): Promise<void> {
  if (!currentExercise) {
    return;
  }

  const validSets = currentSets.filter((set) => isSetComplete(set, currentExercise));
  if (validSets.length === 0) {
    return;
  }

  const summary = await invoke<WorkoutSummary>("log_workout", {
    exerciseId: currentExercise.id,
    sets: validSets,
    isBodyweight: currentExercise.is_bodyweight,
  });

  lastSummary = summary;
  lastSavedExercise = currentExercise;
  closeLogView();
  await loadDashboard();
}

function closeLogView(): void {
  stopRestTimer();
  currentExercise = null;
  currentInsights = { last_workout: null, history: [] };
  currentSets = [{ weight: 0, reps: 0 }];
  showAllExercises = previousScreen === "all";
  render();
}

function renderToast(): void {
  if (!lastSummary || !lastSavedExercise) {
    if (!lastSummary) {
      toastRoot.innerHTML = "";
    }
    return;
  }

  toastRoot.innerHTML = `
    <div class="toast-card">
      <div>
        <span>Workout Saved</span>
        <strong>${formatVolume(lastSavedExercise, lastSummary.total_volume)}</strong>
      </div>
      <div>
        <span>Points</span>
        <strong>+${lastSummary.earned_points.toFixed(1)}</strong>
      </div>
      <div>
        <span>Level</span>
        <strong>${lastSummary.level}</strong>
      </div>
      <div>
        <span>Run</span>
        <strong>${lastSummary.exercise_streak}</strong>
      </div>
    </div>
  `;

  if (toastTimeout !== null) {
    window.clearTimeout(toastTimeout);
  }

  toastTimeout = window.setTimeout(() => {
    lastSummary = null;
    lastSavedExercise = null;
    toastTimeout = null;
    renderToast();
  }, 3800);
}

function calculateVolume(): number {
  if (!currentExercise) {
    return 0;
  }

  if (currentExercise.is_bodyweight) {
    return currentSets.reduce((sum, set) => sum + set.reps, 0);
  }

  return currentSets.reduce((sum, set) => sum + set.weight * set.reps, 0);
}

function isSetComplete(set: SetInput, exercise: Exercise | null): boolean {
  if (!exercise) {
    return false;
  }

  if (exercise.is_bodyweight) {
    return set.reps > 0;
  }

  return set.weight > 0 && set.reps > 0;
}

function restartRestTimer(): void {
  stopRestTimer();
  secondsElapsed = 0;
  updateTimer();

  timerInterval = window.setInterval(() => {
    secondsElapsed += 1;
    updateTimer();
  }, 1000);
}

function stopRestTimer(): void {
  if (timerInterval !== null) {
    window.clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimer(): void {
  const timer = document.querySelector<HTMLElement>("#rest-timer");
  if (timer) {
    timer.textContent = formatTimer(secondsElapsed);
  }
}

function formatSplitTitle(splitKey: string): string {
  return splitKey === "B" ? "Workout B" : "Workout A";
}

function formatSet(exercise: Exercise, set: GhostSet): string {
  if (exercise.is_bodyweight) {
    return `Set ${set.set_number}: ${set.reps} reps`;
  }

  return `Set ${set.set_number}: ${set.weight} kg x ${set.reps}`;
}

function formatVolume(exercise: Exercise, volume: number): string {
  if (exercise.is_bodyweight) {
    return `${volume.toFixed(0)} reps`;
  }

  return `${volume.toFixed(0)} kg`;
}

function formatBaseline(exercise: Exercise): string {
  if (exercise.is_bodyweight) {
    return `${exercise.baseline_volume.toFixed(0)} reps`;
  }

  return `${exercise.baseline_volume.toFixed(0)} kg`;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatToday(): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

window.addEventListener("DOMContentLoaded", () => {
  void loadDashboard();
});
