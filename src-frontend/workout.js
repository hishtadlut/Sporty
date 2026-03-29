"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWorkoutView = void 0;
const api_js_1 = require("./api.js");
const dashboard_js_1 = require("./dashboard.js");
let activeWorkoutSets = [];
let exercises = [];
let timerInterval = null;
let secondsElapsed = 0;
const initWorkoutView = async () => {
    exercises = await (0, api_js_1.fetchAPI)('/exercises');
    renderWorkoutForm();
};
exports.initWorkoutView = initWorkoutView;
const startTimer = () => {
    if (timerInterval)
        clearInterval(timerInterval);
    secondsElapsed = 0;
    const timerDisplay = document.getElementById('rest-timer');
    if (!timerDisplay)
        return;
    timerDisplay.innerText = '00:00';
    timerInterval = setInterval(() => {
        secondsElapsed++;
        const m = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
        const s = String(secondsElapsed % 60).padStart(2, '0');
        timerDisplay.innerText = `${m}:${s}`;
    }, 1000);
};
const renderWorkoutForm = () => {
    const container = document.getElementById('workout-container');
    if (!container)
        return;
    container.innerHTML = `
        <div class="workout-form">
            <div id="rest-timer" class="timer">00:00</div>

            <select id="exercise-select">
                <option value="">-- Select Exercise --</option>
                ${exercises.map(e => `<option value="${e.id}">${e.name} (${e.muscle_group})</option>`).join('')}
            </select>

            <div id="ghost-mode-container"></div>

            <div class="set-row">
                <input type="number" id="reps-input" placeholder="Reps" min="1">
                <input type="number" id="weight-input" placeholder="Weight" min="0">
            </div>

            <button id="add-set-btn">Log Set</button>
            <br/><br/>

            <h3>Today's Sets</h3>
            <div id="current-workout-list"></div>

            <br/>
            <button id="finish-workout-btn" class="btn-secondary">Finish Workout</button>
        </div>
    `;
    document.getElementById('exercise-select')?.addEventListener('change', handleExerciseSelect);
    document.getElementById('add-set-btn')?.addEventListener('click', handleAddSet);
    document.getElementById('finish-workout-btn')?.addEventListener('click', handleFinishWorkout);
};
const handleExerciseSelect = async (e) => {
    const exerciseId = e.target.value;
    const ghostContainer = document.getElementById('ghost-mode-container');
    if (!exerciseId || !ghostContainer)
        return;
    try {
        const history = await (0, api_js_1.fetchAPI)(`/workouts/history/${exerciseId}`);
        if (history && history.length > 0) {
            const lastWorkout = history[0];
            const setsHtml = lastWorkout.sets.map((s) => `Set ${s.set_number}: ${s.reps} reps @ ${s.weight} (Vol: ${s.volume})`).join('<br/>');
            ghostContainer.innerHTML = `
                <div class="ghost-log">
                    <strong>Ghost Mode (Last Session: ${new Date(lastWorkout.date).toLocaleDateString()})</strong><br/>
                    ${setsHtml}
                </div>
            `;
        }
        else {
            ghostContainer.innerHTML = '<div class="ghost-log">No previous history for this exercise.</div>';
        }
    }
    catch (err) {
        console.error('Error fetching history', err);
    }
};
const handleAddSet = () => {
    const exSelect = document.getElementById('exercise-select');
    const repsInput = document.getElementById('reps-input');
    const weightInput = document.getElementById('weight-input');
    if (!exSelect || !repsInput || !weightInput)
        return;
    const exerciseId = parseInt(exSelect.value);
    const reps = parseInt(repsInput.value);
    const weight = parseFloat(weightInput.value);
    if (!exerciseId || isNaN(reps) || isNaN(weight)) {
        alert('Please select an exercise and enter valid reps/weight.');
        return;
    }
    const exerciseOptionText = (exSelect && exSelect.options && exSelect.options[exSelect.selectedIndex]) ? exSelect.options[exSelect.selectedIndex].text : '';
    const isBodyweight = exercises.find(e => e.id === exerciseId)?.is_bodyweight === 1;
    const volume = isBodyweight ? reps : reps * weight;
    activeWorkoutSets.push({
        exerciseId,
        exerciseName: exerciseOptionText,
        reps,
        weight: isBodyweight ? 0 : weight,
        volume
    });
    renderCurrentSets();
    startTimer(); // Start/restart the rest timer
};
const renderCurrentSets = () => {
    const list = document.getElementById('current-workout-list');
    if (!list)
        return;
    list.innerHTML = activeWorkoutSets.map((s, idx) => `
        <div style="padding: 0.5rem; border-bottom: 1px solid #444;">
            ${idx + 1}. ${s.exerciseName} - ${s.reps} reps @ ${s.weight} (Vol: ${s.volume})
        </div>
    `).join('');
};
const handleFinishWorkout = async () => {
    if (activeWorkoutSets.length === 0) {
        alert('No sets logged!');
        return;
    }
    try {
        const res = await (0, api_js_1.fetchAPI)('/workouts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: new Date().toISOString(),
                sets: activeWorkoutSets
            })
        });
        if (timerInterval)
            clearInterval(timerInterval);
        // Show Recap
        alert(`Workout Complete!\nTotal Points: +${res.totalWorkoutPoints.toFixed(2)}\nCheck Dashboard for updated heatmaps and levels!`);
        activeWorkoutSets = [];
        renderCurrentSets();
        // Refresh Dashboard
        await (0, dashboard_js_1.renderHeatmap)();
        await (0, dashboard_js_1.renderRecommendations)();
        // Navigate back to dashboard (handled roughly by mimicking a click)
        document.getElementById('nav-dashboard')?.click();
    }
    catch (err) {
        console.error('Error saving workout', err);
        alert('Failed to save workout');
    }
};
//# sourceMappingURL=workout.js.map