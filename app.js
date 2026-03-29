const EXERCISES = [
  { name: "סקוואט", muscle: "רגליים" },
  { name: "דדליפט", muscle: "גב תחתון" },
  { name: "בנץ' פרס", muscle: "חזה" },
  { name: "אוברהד פרס", muscle: "כתפיים" },
  { name: "חתירה", muscle: "גב" },
  { name: "מתח", muscle: "גב" },
  { name: "לאנג'", muscle: "רגליים" },
  { name: "פשיטת ברך", muscle: "ארבע ראשי" },
  { name: "כפיפת ברך", muscle: "המסטרינג" },
  { name: "פשיטת מרפק", muscle: "טרייספס" },
  { name: "כפיפת מרפק", muscle: "בייספס" },
  { name: "הרמות תאומים", muscle: "תאומים" },
];

const RECOVERY_HOURS = 48;
const STORAGE_KEY = "sporty-state-v1";

const defaultState = {
  history: [],
  muscleStats: {},
  personalRecords: {},
  currentWorkout: { date: new Date().toISOString(), sets: [], volume: 0, points: 0, streakGain: 0 },
};

const state = loadState();
const ui = {
  exercise: document.getElementById("exercise"),
  trendExercise: document.getElementById("trend-exercise"),
  ghost: document.getElementById("ghost"),
  form: document.getElementById("set-form"),
  setNumber: document.getElementById("set-number"),
  weight: document.getElementById("weight"),
  reps: document.getElementById("reps"),
  restTimer: document.getElementById("rest-timer"),
  currentVolume: document.getElementById("current-volume"),
  sessionPoints: document.getElementById("session-points"),
  finishWorkout: document.getElementById("finish-workout"),
  heatmap: document.getElementById("heatmap"),
  recommendations: document.getElementById("recommendations"),
  levels: document.getElementById("muscle-levels"),
  trendCanvas: document.getElementById("trend-canvas"),
  recapTemplate: document.getElementById("recap-template"),
};

let restStartedAt = Date.now();

initialize();

function initialize() {
  EXERCISES.forEach(({ name }) => {
    ui.exercise.add(new Option(name, name));
    ui.trendExercise.add(new Option(name, name));
  });

  ui.exercise.addEventListener("change", renderGhostMode);
  ui.form.addEventListener("submit", addSet);
  ui.finishWorkout.addEventListener("click", finishWorkout);
  ui.trendExercise.addEventListener("change", drawTrendline);

  setInterval(updateRestTimer, 1000);
  applyDailyPenalties();
  renderAll();
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultState);
  try {
    return { ...structuredClone(defaultState), ...JSON.parse(saved) };
  } catch {
    return structuredClone(defaultState);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function addSet(event) {
  event.preventDefault();
  const exercise = ui.exercise.value;
  const setNumber = Number(ui.setNumber.value);
  const weight = Number(ui.weight.value);
  const reps = Number(ui.reps.value);
  const volume = weight * reps;

  const exMeta = EXERCISES.find((item) => item.name === exercise);
  const set = { exercise, muscle: exMeta.muscle, setNumber, weight, reps, volume, at: new Date().toISOString() };

  state.currentWorkout.sets.push(set);
  state.currentWorkout.volume += volume;

  const points = evaluateSetPoints(set);
  state.currentWorkout.points += points;

  restStartedAt = Date.now();
  persist();
  renderAll();
}

function evaluateSetPoints(set) {
  const muscle = ensureMuscle(set.muscle);
  const exHistory = state.history.flatMap((w) => w.sets).filter((s) => s.exercise === set.exercise);
  const prevWorkoutDate = [...state.history].reverse().find((w) => w.sets.some((s) => s.exercise === set.exercise))?.date;

  let points = 0.1;

  if (prevWorkoutDate) {
    const days = (Date.now() - new Date(prevWorkoutDate).getTime()) / (1000 * 60 * 60 * 24);
    if (days <= 7) points += 0.1;
    if (days <= 3.5) points += 1.2;
  }

  const best = state.personalRecords[set.exercise] || 0;
  if (set.volume > best) {
    state.personalRecords[set.exercise] = set.volume;
    points *= 1.5;
  }

  const lastSameExercise = exHistory[exHistory.length - 1];
  if (!lastSameExercise || set.volume >= lastSameExercise.volume) {
    muscle.streak += 1;
    points += 0.1;
    if (muscle.streak >= 3) points += 0.1;
    if (muscle.streak >= 6) points += 0.1;
  } else {
    muscle.streak = 0;
  }

  muscle.points += points;
  muscle.lastTrainedAt = set.at;
  muscle.level = Math.max(0, Number((muscle.points / 10).toFixed(2)));
  return points;
}

function ensureMuscle(muscleName) {
  if (!state.muscleStats[muscleName]) {
    state.muscleStats[muscleName] = { points: 0, level: 0, streak: 0, lastTrainedAt: null, penaltiesAppliedOn: null };
  }
  return state.muscleStats[muscleName];
}

function applyDailyPenalties() {
  const today = new Date().toISOString().slice(0, 10);
  Object.values(state.muscleStats).forEach((muscle) => {
    if (!muscle.lastTrainedAt || muscle.penaltiesAppliedOn === today) return;
    const days = (Date.now() - new Date(muscle.lastTrainedAt).getTime()) / (1000 * 60 * 60 * 24);

    let penalty = 0;
    if (days >= 14) penalty = 0.5;
    else if (days >= 10.5) penalty = 0.1;

    if (penalty > 0) {
      muscle.points = Math.max(0, muscle.points - penalty);
      muscle.level = Math.max(0, Number((muscle.points / 10).toFixed(2)));
    }
    muscle.penaltiesAppliedOn = today;
  });
  persist();
}

function finishWorkout() {
  if (state.currentWorkout.sets.length === 0) return;
  state.history.push({ ...state.currentWorkout, date: new Date().toISOString() });

  const recapData = {
    volume: state.currentWorkout.volume,
    points: state.currentWorkout.points,
    streak: Object.values(state.muscleStats).reduce((max, m) => Math.max(max, m.streak), 0),
  };

  state.currentWorkout = { date: new Date().toISOString(), sets: [], volume: 0, points: 0, streakGain: 0 };
  persist();
  renderAll();
  showRecap(recapData);
}

function showRecap({ volume, points, streak }) {
  const node = ui.recapTemplate.content.cloneNode(true);
  node.getElementById("recap-volume").textContent = `נפח כולל: ${Math.round(volume)} ק"ג`;
  node.getElementById("recap-streak").textContent = `רצף מוביל: ${streak}`;
  node.getElementById("recap-points").textContent = `נקודות שהורווחו: ${points.toFixed(2)}`;
  const overlay = node.querySelector(".recap-overlay");
  node.getElementById("close-recap").addEventListener("click", () => overlay.remove());
  document.body.appendChild(node);
}

function renderAll() {
  renderGhostMode();
  updateRestTimer();
  ui.currentVolume.textContent = Math.round(state.currentWorkout.volume);
  ui.sessionPoints.textContent = state.currentWorkout.points.toFixed(2);
  renderHeatmap();
  renderRecommendations();
  renderLevels();
  drawTrendline();
}

function renderGhostMode() {
  const exercise = ui.exercise.value;
  const lastWorkout = [...state.history].reverse().find((w) => w.sets.some((s) => s.exercise === exercise));
  if (!lastWorkout) {
    ui.ghost.textContent = "Ghost Mode: אין אימון קודם לתרגיל זה.";
    return;
  }
  const sets = lastWorkout.sets.filter((s) => s.exercise === exercise);
  const txt = sets.map((s) => `סט ${s.setNumber}: ${s.weight}x${s.reps}`).join(" | ");
  ui.ghost.textContent = `Ghost Mode: ${txt}`;
}

function updateRestTimer() {
  const secs = Math.floor((Date.now() - restStartedAt) / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  ui.restTimer.textContent = `${mm}:${ss}`;
}

function recoveryState(lastTrainedAt) {
  if (!lastTrainedAt) return { color: "#ef4444", label: "מוזנח" };
  const hours = (Date.now() - new Date(lastTrainedAt).getTime()) / 36e5;
  if (hours < RECOVERY_HOURS) {
    const left = Math.ceil(RECOVERY_HOURS - hours);
    return { color: "#60a5fa", label: `בהתאוששות (${left}ש׳)` };
  }
  if (hours < RECOVERY_HOURS + 24) return { color: "#22c55e", label: "מוכן" };
  return { color: "#f59e0b", label: "מוכן מאוד" };
}

function renderHeatmap() {
  const muscles = [...new Set(EXERCISES.map((e) => e.muscle))];
  ui.heatmap.innerHTML = "";
  muscles.forEach((name) => {
    const m = ensureMuscle(name);
    const stateInfo = recoveryState(m.lastTrainedAt);
    const el = document.createElement("div");
    el.className = "muscle-card";
    el.style.background = stateInfo.color;
    el.innerHTML = `${name}<div class="small">${stateInfo.label}</div>`;
    ui.heatmap.appendChild(el);
  });
}

function renderRecommendations() {
  const candidates = EXERCISES.filter((e) => recoveryState(ensureMuscle(e.muscle).lastTrainedAt).label.includes("מוכן"));
  const picks = candidates.slice(0, 3);
  ui.recommendations.innerHTML = "";
  if (!picks.length) {
    ui.recommendations.innerHTML = "<li>אין שרירים מוכנים כרגע. התמקד בהתאוששות.</li>";
    return;
  }
  picks.forEach((pick) => {
    const li = document.createElement("li");
    li.textContent = `${pick.name} (${pick.muscle})`;
    ui.recommendations.appendChild(li);
  });
}

function renderLevels() {
  const muscles = Object.entries(state.muscleStats);
  if (!muscles.length) {
    ui.levels.innerHTML = "<p>אין נתונים עדיין.</p>";
    return;
  }
  ui.levels.innerHTML = muscles
    .map(([name, m]) => `<p><strong>${name}</strong> — Level ${m.level.toFixed(2)} | נקודות: ${m.points.toFixed(2)} | רצף: ${m.streak}</p>`)
    .join("");
}

function drawTrendline() {
  const exercise = ui.trendExercise.value;
  const workoutVolumes = state.history
    .map((w) => ({
      date: w.date,
      volume: w.sets.filter((s) => s.exercise === exercise).reduce((sum, s) => sum + s.volume, 0),
    }))
    .filter((i) => i.volume > 0)
    .slice(-12);

  const ctx = ui.trendCanvas.getContext("2d");
  ctx.clearRect(0, 0, ui.trendCanvas.width, ui.trendCanvas.height);
  ctx.strokeStyle = "#64748b";
  ctx.strokeRect(20, 20, 460, 180);

  if (workoutVolumes.length < 2) {
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText("אין מספיק נתונים לגרף.", 30, 40);
    return;
  }

  const maxV = Math.max(...workoutVolumes.map((v) => v.volume));
  ctx.strokeStyle = "#38bdf8";
  ctx.beginPath();

  workoutVolumes.forEach((point, idx) => {
    const x = 30 + (idx * 440) / (workoutVolumes.length - 1);
    const y = 190 - (point.volume / maxV) * 160;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
  });

  ctx.stroke();
}
