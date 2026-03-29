"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const navigate = (id) => {
    const views = ['dashboard', 'workout', 'analytics'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        const navBtn = document.getElementById(`nav-${v}`);
        if (el) {
            if (v === id) {
                el.classList.add('active');
                navBtn?.classList.add('active');
            }
            else {
                el.classList.remove('active');
                navBtn?.classList.remove('active');
            }
        }
    });
};
const setupShell = () => {
    const mainContent = document.getElementById('main-content');
    if (!mainContent)
        return;
    mainContent.innerHTML = `
    <div id="view-dashboard" class="view active">
      <div class="dashboard-grid">
        <div class="panel">
          <h2>Body Heatmap</h2>
          <div class="heatmap-container" id="heatmap-render">
            Loading...
          </div>
        </div>
        <div class="panel">
          <h2>What to do today?</h2>
          <div id="recommendations-container"></div>
        </div>
      </div>
    </div>
    <div id="view-workout" class="view">
      <div class="panel">
        <h2>Active Workout</h2>
        <div id="workout-container"></div>
      </div>
    </div>
    <div id="view-analytics" class="view">
      <div class="panel">
        <h2>Analytics & Trendlines</h2>
        <div id="analytics-container"></div>
      </div>
    </div>
  `;
    document.getElementById('nav-dashboard')?.addEventListener('click', () => navigate('dashboard'));
    document.getElementById('nav-workout')?.addEventListener('click', () => navigate('workout'));
    document.getElementById('nav-analytics')?.addEventListener('click', () => navigate('analytics'));
};
const dashboard_js_1 = require("./dashboard.js");
const workout_js_1 = require("./workout.js");
const analytics_js_1 = require("./analytics.js");
document.addEventListener('DOMContentLoaded', async () => {
    setupShell();
    await (0, dashboard_js_1.renderHeatmap)();
    await (0, dashboard_js_1.renderRecommendations)();
    await (0, workout_js_1.initWorkoutView)();
    await (0, analytics_js_1.initAnalyticsView)();
});
//# sourceMappingURL=app.js.map