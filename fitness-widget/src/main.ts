import { invoke } from "@tauri-apps/api/core";

interface Exercise {
  id: number;
  name: string;
  muscle_group: string;
  is_bodyweight: boolean;
  level: number;
  points: number;
}

interface GhostSet {
  set_number: number;
  weight: number;
  reps: number;
}

interface SetInput {
  weight: number;
  reps: number;
}

let exercises: Exercise[] = [];
let currentIndex = 0;
let currentExercise: Exercise | null = null;
let currentSets: SetInput[] = [];
let ghostSets: GhostSet[] = [];
let timerInterval: number | null = null;
let secondsElapsed = 0;

async function loadExercises() {
  try {
    exercises = await invoke("get_exercises");
    currentIndex = await invoke("get_current_loop_index");
    renderList();
  } catch (error) {
    console.error("Failed to load exercises:", error);
  }
}

function renderList() {
  const container = document.getElementById("exercise-list");
  if (!container) return;
  container.innerHTML = "";

  for (let i = 0; i < 6; i++) {
    const exIndex = (currentIndex + i) % exercises.length;
    const ex = exercises[exIndex];
    container.appendChild(createExerciseElement(ex, true));
  }

  for (let i = 6; i < exercises.length; i++) {
    const exIndex = (currentIndex + i) % exercises.length;
    const ex = exercises[exIndex];
    container.appendChild(createExerciseElement(ex, false));
  }
}

function createExerciseElement(ex: Exercise, isToday: boolean): HTMLElement {
  const el = document.createElement("div");
  el.className = `exercise-item ${isToday ? "today" : ""}`;

  const pointsClass = ex.points >= 0 ? "points-positive" : "points-negative";
  const pointsPrefix = ex.points > 0 ? "+" : "";

  el.innerHTML = `
    <div class="ex-info">
      <div class="ex-name">${ex.name}</div>
      <div class="ex-muscle">
        <span class="badge ${isToday ? 'today-badge' : ''}">${isToday ? 'TODAY' : 'BONUS'}</span>
        ${ex.muscle_group}
      </div>
    </div>
    <div class="ex-stats">
      <div class="level-text">Lvl ${ex.level}</div>
      <div class="points-text ${pointsClass}">${pointsPrefix}${ex.points.toFixed(1)} pts</div>
    </div>
  `;

  el.addEventListener('click', () => openLogView(ex));
  return el;
}

async function openLogView(ex: Exercise) {
  currentExercise = ex;
  currentSets = [{ weight: 0, reps: 0 }];

  try {
    ghostSets = await invoke("get_ghost_data", { exerciseId: ex.id });
  } catch(e) {
    console.error(e);
    ghostSets = [];
  }

  document.getElementById("main-view")!.classList.add("hidden");
  const logView = document.getElementById("log-view")!;
  logView.classList.remove("hidden");

  renderLogView();
  startRestTimer();
}

function startRestTimer() {
  stopRestTimer();
  secondsElapsed = 0;
  updateTimerUI();

  timerInterval = window.setInterval(() => {
    secondsElapsed++;
    updateTimerUI();
  }, 1000);
}

function stopRestTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerUI() {
  const timerBox = document.getElementById("rest-timer");
  if (!timerBox) return;

  const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
  const secs = (secondsElapsed % 60).toString().padStart(2, '0');
  timerBox.textContent = `${mins}:${secs}`;

  if (secondsElapsed > 0) {
    timerBox.classList.add("active");
  }
}

function renderLogView() {
  if (!currentExercise) return;

  const logView = document.getElementById("log-view")!;
  logView.innerHTML = `
    <div class="log-header">
      <button class="back-btn" id="btn-back">←</button>
      <div class="log-title">${currentExercise.name}</div>
      <div class="timer-box" id="rest-timer">00:00</div>
    </div>

    <div class="sets-container" id="sets-container"></div>

    <button class="btn-secondary" id="btn-add-set">+ Add Set</button>

    <div class="volume-display">
      Total Volume: <span class="volume-value" id="total-volume-ui">0 ${currentExercise.is_bodyweight ? 'Reps' : 'KG'}</span>
    </div>

    <button class="btn-primary" id="btn-finish">Finish Exercise</button>
  `;

  document.getElementById("btn-back")!.addEventListener('click', () => {
    stopRestTimer();
    document.getElementById("log-view")!.classList.add("hidden");
    document.getElementById("main-view")!.classList.remove("hidden");
  });

  document.getElementById("btn-add-set")!.addEventListener('click', () => {
    currentSets.push({ weight: 0, reps: 0 });
    startRestTimer(); // Reset timer when completing/adding a set
    renderSets();
    calculateVolume();
  });

  document.getElementById("btn-finish")!.addEventListener('click', async () => {
    // Save to DB
    try {
      await invoke("log_workout", {
        exerciseId: currentExercise!.id,
        sets: currentSets,
        isBodyweight: currentExercise!.is_bodyweight
      });

      // Advance Loop (if it was a daily exercise - or maybe just advance anyway to progress)
      // To keep it simple, advancing the loop logic can be purely linear.
      await invoke("advance_loop", { count: 1 });

      stopRestTimer();
      document.getElementById("log-view")!.classList.add("hidden");
      document.getElementById("main-view")!.classList.remove("hidden");
      loadExercises(); // Reload everything
    } catch(e) {
      console.error(e);
      alert("Failed to save workout: " + e);
    }
  });

  renderSets();
  calculateVolume();
}

function renderSets() {
  const container = document.getElementById("sets-container")!;
  container.innerHTML = "";

  currentSets.forEach((set, idx) => {
    const setNum = idx + 1;
    const ghost = ghostSets.find(g => g.set_number === setNum);

    const row = document.createElement("div");
    row.className = "set-row";

    let inputsHTML = '';
    let ghostHTML = '';

    if (ghost) {
      ghostHTML = `
        <div class="ghost-text">
          <div class="ghost-label">Last Time</div>
          ${currentExercise!.is_bodyweight ? ghost.reps : ghost.weight + 'x' + ghost.reps}
        </div>
      `;
    }

    if (currentExercise!.is_bodyweight) {
      inputsHTML = `
        <div class="input-group" style="flex: 1">
          <div class="input-label">Reps</div>
          <input type="number" class="input-field" value="${set.reps || ''}" min="0" data-idx="${idx}" data-field="reps" placeholder="0" />
        </div>
      `;
    } else {
      inputsHTML = `
        <div class="input-group">
          <div class="input-label">KG</div>
          <input type="number" class="input-field" value="${set.weight || ''}" min="0" step="0.5" data-idx="${idx}" data-field="weight" placeholder="0" />
        </div>
        <div class="input-group">
          <div class="input-label">Reps</div>
          <input type="number" class="input-field" value="${set.reps || ''}" min="0" data-idx="${idx}" data-field="reps" placeholder="0" />
        </div>
      `;
    }

    row.innerHTML = `
      <div class="set-number">${setNum}</div>
      <div class="inputs">${inputsHTML}</div>
      ${ghostHTML}
    `;

    container.appendChild(row);
  });

  // Attach Event Listeners to inputs
  document.querySelectorAll(".input-field").forEach(input => {
    input.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      const idx = parseInt(target.getAttribute("data-idx")!);
      const field = target.getAttribute("data-field")!;
      const val = parseFloat(target.value) || 0;

      if (field === "weight") currentSets[idx].weight = val;
      if (field === "reps") currentSets[idx].reps = Math.floor(val);

      calculateVolume();
    });
  });
}

function calculateVolume() {
  if (!currentExercise) return;

  let vol = 0;
  if (currentExercise.is_bodyweight) {
    vol = currentSets.reduce((sum, s) => sum + s.reps, 0);
  } else {
    vol = currentSets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
  }

  const ui = document.getElementById("total-volume-ui");
  if (ui) {
    ui.textContent = `${vol} ${currentExercise.is_bodyweight ? 'Reps' : 'KG'}`;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  loadExercises();
});
