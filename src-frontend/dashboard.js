"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderRecommendations = exports.renderHeatmap = void 0;
const api_js_1 = require("./api.js");
const heatmap3D_js_1 = require("./heatmap3D.js");
const renderHeatmap = async () => {
    const container = document.getElementById('heatmap-render');
    if (!container)
        return;
    // Initialize the 3D scene (this handles downloading the .glb and rendering)
    (0, heatmap3D_js_1.init3DHeatmap)('heatmap-render');
    try {
        const stats = await (0, api_js_1.fetchAPI)('/muscle-stats');
        // Apply colors based on the stats
        (0, heatmap3D_js_1.applyHeatmapColors)(stats);
    }
    catch (err) {
        console.error(err);
    }
};
exports.renderHeatmap = renderHeatmap;
const renderRecommendations = async () => {
    const container = document.getElementById('recommendations-container');
    if (!container)
        return;
    try {
        const recs = await (0, api_js_1.fetchAPI)('/recommendations');
        if (recs.length === 0) {
            container.innerHTML = '<p>No exercises fully recovered yet. Take a rest day!</p>';
            return;
        }
        container.innerHTML = recs.map((r) => `
      <div style="padding: 1rem; background: #2a2a2a; margin-bottom: 0.5rem; border-radius: 4px; border-left: 4px solid var(--accent)">
        <strong>${r.name}</strong> (${r.muscle_group})
      </div>
    `).join('');
    }
    catch (err) {
        console.error(err);
    }
};
exports.renderRecommendations = renderRecommendations;
//# sourceMappingURL=dashboard.js.map