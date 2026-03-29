"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAnalyticsView = void 0;
const api_js_1 = require("./api.js");
let chartInstance = null;
const initAnalyticsView = async () => {
    const exercises = await (0, api_js_1.fetchAPI)('/exercises');
    const container = document.getElementById('analytics-container');
    if (!container)
        return;
    container.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <label>Select Exercise to view Progress:</label>
            <select id="analytics-exercise-select" style="width: 100%; padding: 0.5rem; background: #2a2a2a; color: white; border: 1px solid #444; margin-top: 0.5rem;">
                <option value="">-- Select --</option>
                ${exercises.map((e) => `<option value="${e.id}">${e.name}</option>`).join('')}
            </select>
        </div>
        <div style="height: 300px; width: 100%;">
            <canvas id="trendChart"></canvas>
        </div>
    `;
    document.getElementById('analytics-exercise-select')?.addEventListener('change', renderChart);
};
exports.initAnalyticsView = initAnalyticsView;
const renderChart = async (e) => {
    const exerciseId = e.target.value;
    if (!exerciseId)
        return;
    try {
        const history = await (0, api_js_1.fetchAPI)(`/workouts/history/${exerciseId}`);
        // history is sorted newest first. Let's reverse for chart (oldest to newest)
        history.reverse();
        const labels = history.map((h) => new Date(h.date).toLocaleDateString());
        const data = history.map((h) => {
            // Total volume for this exercise in this workout
            return h.sets.reduce((sum, set) => sum + set.volume, 0);
        });
        const ctx = document.getElementById('trendChart').getContext('2d');
        if (!ctx)
            return;
        if (chartInstance) {
            chartInstance.destroy();
        }
        // @ts-ignore
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                        label: 'Total Volume',
                        data: data,
                        borderColor: '#4ade80',
                        backgroundColor: 'rgba(74, 222, 128, 0.2)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#333' },
                        ticks: { color: '#b3b3b3' }
                    },
                    x: {
                        grid: { color: '#333' },
                        ticks: { color: '#b3b3b3' }
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#fff' }
                    }
                }
            }
        });
    }
    catch (err) {
        console.error('Failed to render chart', err);
    }
};
//# sourceMappingURL=analytics.js.map