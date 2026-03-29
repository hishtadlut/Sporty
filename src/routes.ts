import express from 'express';
import { openDB } from './db';

const router = express.Router();

// Fetch all 12 exercises
router.get('/exercises', async (req, res) => {
  try {
    const db = await openDB();
    const exercises = await db.all('SELECT * FROM exercises');
    res.json(exercises);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch exercises' });
  }
});

// Fetch muscle stats
router.get('/muscle-stats', async (req, res) => {
  try {
    const db = await openDB();
    const stats = await db.all('SELECT * FROM muscle_stats');
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch muscle stats' });
  }
});

// Helper function to calculate points
function calculatePoints(
  muscleGroup: string,
  totalVolume: number,
  baselineWork: number,
  previousStats: any,
  workoutHistory: any[]
): { points: number; newStreak: number; newMaxVolume: number; prBroken: boolean } {
  let points = 0;
  let prBroken = false;
  let newStreak = previousStats.consecutive_streaks;
  let newMaxVolume = previousStats.max_volume;

  // Consistency Scoring (simplified for now: check frequency in last 7 days)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recentWorkouts = workoutHistory.filter(w => new Date(w.date) >= sevenDaysAgo);
  const frequency = recentWorkouts.length + 1; // including today

  if (frequency === 1) points += 0.1;
  else if (frequency === 2) points += 1.3;
  else if (frequency >= 3) points += 1.5;

  let lastWorkoutVolume = 0;
  if (workoutHistory.length > 0) {
    lastWorkoutVolume = workoutHistory[0].volume;
  }

  if (lastWorkoutVolume > 0 && totalVolume >= lastWorkoutVolume) {
    points += 0.1;
    newStreak++;
    if (newStreak === 3) {
      points += 0.1;
    } else if (newStreak >= 6) {
      points += 0.1;
    }
  } else {
    newStreak = 0;
  }

  if (totalVolume > previousStats.max_volume) {
    prBroken = true;
    points += 0.5;
    newMaxVolume = totalVolume;
  }

  return { points, newStreak, newMaxVolume, prBroken };
}

// Save a new workout
router.post('/workouts', async (req, res) => {
  const { date, sets } = req.body;

  try {
    const db = await openDB();
    await db.exec('BEGIN TRANSACTION');

    const setsByExercise: { [key: number]: any[] } = {};
    for (const set of sets) {
      if (!setsByExercise[set.exerciseId]) {
        setsByExercise[set.exerciseId] = [];
      }
      setsByExercise[set.exerciseId]!.push(set);
    }

    let totalWorkoutPoints = 0;
    let totalWorkoutVolume = 0;
    const muscleGroupUpdates: { [key: string]: any } = {};

    for (const exerciseIdStr in setsByExercise) {
      const exerciseId = parseInt(exerciseIdStr);
      const exerciseSets = setsByExercise[exerciseId];
      if (!exerciseSets) continue;

      const exercise = await db.get('SELECT * FROM exercises WHERE id = ?', [exerciseId]);
      if (!exercise) continue;

      const muscleGroup = exercise.muscle_group;
      const baselineWork = exercise.baseline_work;

      let exerciseTotalVolume = 0;
      for (const set of exerciseSets) {
        exerciseTotalVolume += set.volume;
      }
      totalWorkoutVolume += exerciseTotalVolume;

      const prevStats = await db.get('SELECT * FROM muscle_stats WHERE muscle_group = ?', [muscleGroup]);

      const history = await db.all(`
        SELECT SUM(ws.volume) as volume, w.date
        FROM workout_sets ws
        JOIN workouts w ON ws.workout_id = w.id
        JOIN exercises e ON ws.exercise_id = e.id
        WHERE e.muscle_group = ?
        GROUP BY w.id
        ORDER BY w.date DESC
      `, [muscleGroup]);

      const { points, newStreak, newMaxVolume, prBroken } = calculatePoints(
        muscleGroup,
        exerciseTotalVolume,
        baselineWork,
        prevStats || { consecutive_streaks: 0, max_volume: 0, points: 0, level: 1 },
        history
      );

      totalWorkoutPoints += points;
      muscleGroupUpdates[muscleGroup] = {
        pointsEarned: points,
        newStreak,
        newMaxVolume,
        prBroken,
        prevPoints: prevStats ? prevStats.points : 0,
        prevLevel: prevStats ? prevStats.level : 1
      };
    }

    const insertWorkoutStmt = await db.prepare('INSERT INTO workouts (date, total_volume, points_earned) VALUES (?, ?, ?)');
    const workoutResult = await insertWorkoutStmt.run(date, totalWorkoutVolume, totalWorkoutPoints);
    const workoutId = workoutResult.lastID;
    await insertWorkoutStmt.finalize();

    const insertSetStmt = await db.prepare('INSERT INTO workout_sets (workout_id, exercise_id, set_number, reps, weight, volume) VALUES (?, ?, ?, ?, ?, ?)');
    for (const exerciseIdStr in setsByExercise) {
      const exerciseId = parseInt(exerciseIdStr);
      const exerciseSets = setsByExercise[exerciseId];
      if (!exerciseSets) continue;
      let setNum = 1;
      for (const set of exerciseSets) {
        await insertSetStmt.run(workoutId, exerciseId, setNum++, set.reps, set.weight, set.volume);
      }
    }
    await insertSetStmt.finalize();

    const updateMuscleStmt = await db.prepare(`
      UPDATE muscle_stats
      SET points = ?, level = ?, consecutive_streaks = ?, last_trained_date = ?, max_volume = ?
      WHERE muscle_group = ?
    `);

    for (const mg in muscleGroupUpdates) {
      const update = muscleGroupUpdates[mg];
      let newTotalPoints = update.prevPoints + update.pointsEarned;
      let newLevel = Math.floor(newTotalPoints / 10) + 1;

      await updateMuscleStmt.run(
        newTotalPoints,
        newLevel,
        update.newStreak,
        date,
        update.newMaxVolume,
        mg
      );
    }
    await updateMuscleStmt.finalize();

    await db.exec('COMMIT');
    res.json({ success: true, workoutId, totalWorkoutPoints, muscleGroupUpdates });

  } catch (error: any) {
    const db = await openDB();
    await db.exec('ROLLBACK');
    res.status(500).json({ error: 'Failed to save workout', details: error.message });
  }
});

// Fetch history for a specific exercise
router.get('/workouts/history/:exerciseId', async (req, res) => {
  const exerciseId = parseInt(req.params.exerciseId);
  try {
    const db = await openDB();
    const history = await db.all(`
      SELECT ws.*, w.date
      FROM workout_sets ws
      JOIN workouts w ON ws.workout_id = w.id
      WHERE ws.exercise_id = ?
      ORDER BY w.date DESC, ws.set_number ASC
    `, [exerciseId]);

    const groupedHistory: { [date: string]: any[] } = {};
    for (const set of history) {
      if (!groupedHistory[set.date]) {
        groupedHistory[set.date] = [];
      }
      groupedHistory[set.date]!.push(set);
    }

    // Convert to array of objects { date, sets } for easier sorting and processing
    const result = Object.keys(groupedHistory).map(date => {
      const sets = groupedHistory[date];
      if (!sets) return null;
      return {
        date,
        sets
      };
    }).filter(Boolean).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workout history' });
  }
});

// Fetch all previous workouts (useful for trendlines overall)
router.get('/workouts', async (req, res) => {
  try {
    const db = await openDB();
    const history = await db.all(`
      SELECT ws.workout_id, ws.exercise_id, e.name as exercise_name, e.muscle_group, SUM(ws.volume) as total_volume, w.date, w.points_earned
      FROM workout_sets ws
      JOIN workouts w ON ws.workout_id = w.id
      JOIN exercises e ON ws.exercise_id = e.id
      GROUP BY ws.workout_id, ws.exercise_id
      ORDER BY w.date DESC
    `);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workouts' });
  }
});

// "What to do today?" recommendations
router.get('/recommendations', async (req, res) => {
    try {
        const db = await openDB();
        const stats = await db.all('SELECT * FROM muscle_stats');

        const now = new Date();
        const readyMuscleGroups = stats.filter(stat => {
            if (!stat.last_trained_date) return true; // Never trained, highly recommended
            const lastTrained = new Date(stat.last_trained_date);
            const diffDays = Math.floor(Math.abs(now.getTime() - lastTrained.getTime()) / (1000 * 60 * 60 * 24));
            // Consider recovered if trained more than 2 days ago (arbitrary threshold for "green" status)
            return diffDays >= 2;
        }).map(stat => stat.muscle_group);

        if (readyMuscleGroups.length === 0) {
            return res.json([]);
        }

        const placeholders = readyMuscleGroups.map(() => '?').join(',');
        const recommendedExercises = await db.all(`
            SELECT * FROM exercises
            WHERE muscle_group IN (${placeholders})
            ORDER BY RANDOM()
            LIMIT 3
        `, readyMuscleGroups);

        res.json(recommendedExercises);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

// Calculate penalties based on days since last trained
router.post('/trigger-penalties', async (req, res) => {
  try {
    const db = await openDB();
    const stats = await db.all('SELECT * FROM muscle_stats');
    const now = new Date();

    await db.exec('BEGIN TRANSACTION');

    for (const stat of stats) {
      if (!stat.last_trained_date) continue;

      const lastTrained = new Date(stat.last_trained_date);
      const diffTime = Math.abs(now.getTime() - lastTrained.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      let penalty = 0;

      // Determine how many days we should penalize since the last penalty
      let lastPenaltyDays = diffDays;
      if (stat.last_penalty_date) {
        const lastPenalized = new Date(stat.last_penalty_date);
        lastPenaltyDays = Math.floor(Math.abs(now.getTime() - lastPenalized.getTime()) / (1000 * 60 * 60 * 24));
      }

      if (diffDays >= 14) {
        // Daily penalty after 14 days
        if (lastPenaltyDays >= 1) {
          penalty = 0.1 * lastPenaltyDays;
        }
      } else if (diffDays >= 10.5) {
        // One-time penalty at 1.5 weeks
        // Only apply if we haven't penalized since hitting the 10.5 day mark
        if (!stat.last_penalty_date || (new Date(stat.last_penalty_date).getTime() < lastTrained.getTime() + (10.5 * 24 * 60 * 60 * 1000))) {
          penalty = 0.1;
        }
      }

      if (penalty > 0) {
        let newPoints = stat.points - penalty;
        if (newPoints < 0) newPoints = 0; // Prevent negative points
        let newLevel = Math.floor(newPoints / 10) + 1;

        await db.run(
          'UPDATE muscle_stats SET points = ?, level = ?, last_penalty_date = ? WHERE muscle_group = ?',
          [newPoints, newLevel, now.toISOString(), stat.muscle_group]
        );
      }
    }

    await db.exec('COMMIT');
    res.json({ success: true, message: 'Penalties processed' });
  } catch (error: any) {
    const db = await openDB();
    await db.exec('ROLLBACK');
    res.status(500).json({ error: 'Failed to process penalties', details: error.message });
  }
});

export default router;