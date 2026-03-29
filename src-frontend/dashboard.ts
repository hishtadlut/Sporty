import { fetchAPI } from './api.js';
import { init3DHeatmap, applyHeatmapColors } from './heatmap3D.js';

export const renderHeatmap = async () => {
  const container = document.getElementById('heatmap-render');
  if (!container) return;

  // Initialize the 3D scene (this handles downloading the .glb and rendering)
  init3DHeatmap('heatmap-render');

  try {
    const stats = await fetchAPI('/muscle-stats');
    // Apply colors based on the stats
    applyHeatmapColors(stats);
  } catch (err) {
    console.error(err);
  }
};

export const renderRecommendations = async () => {
  const container = document.getElementById('recommendations-container');
  if (!container) return;

  try {
    const recs = await fetchAPI('/recommendations');
    if (recs.length === 0) {
      container.innerHTML = '<p>No exercises fully recovered yet. Take a rest day!</p>';
      return;
    }

    container.innerHTML = recs.map((r: any) => `
      <div style="padding: 1rem; background: #2a2a2a; margin-bottom: 0.5rem; border-radius: 4px; border-left: 4px solid var(--accent)">
        <strong>${r.name}</strong> (${r.muscle_group})
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
};
