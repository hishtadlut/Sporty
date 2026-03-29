import { getBodySVG } from './svgMap.js';
import { fetchAPI } from './api.js';

export const renderHeatmap = async () => {
  const container = document.getElementById('heatmap-render');
  if (!container) return;

  container.innerHTML = getBodySVG();

  try {
    const stats = await fetchAPI('/muscle-stats');
    const now = new Date();

    stats.forEach((stat: any) => {
      const el = document.getElementById(`muscle-${stat.muscle_group}`);
      if (el) {
        if (!stat.last_trained_date) {
          el.setAttribute('fill', '#ef4444'); // Red (neglected)
          return;
        }

        const lastTrained = new Date(stat.last_trained_date);
        const diffDays = Math.floor((now.getTime() - lastTrained.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays >= 7) {
          el.setAttribute('fill', '#ef4444'); // Red
        } else if (diffDays >= 2) {
          el.setAttribute('fill', '#4ade80'); // Green (recovered)
        } else {
          el.setAttribute('fill', '#3b82f6'); // Blue (recovering)
        }
      }
    });
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