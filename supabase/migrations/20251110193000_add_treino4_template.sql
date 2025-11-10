INSERT INTO public.workout_templates (
  slug,
  name,
  description,
  muscle_groups,
  intensity,
  rest_seconds,
  exercises
)
VALUES (
  'treino-4-aerobico-biceps-triceps',
  'Treino 4 (Aerobico, Biceps e Triceps)',
  'Sequencia com aquecimento aerobico e foco em biceps/triceps utilizando cargas progressivas.',
  ARRAY['Aerobico', 'Biceps', 'Triceps'],
  'Moderado',
  60,
  '[
    {
      "name": "Eliptico",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 15 }
      ]
    },
    {
      "name": "Rosca Scott",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 10, "weight": 10 },
        { "set": 2, "reps": 10, "weight": 12 },
        { "set": 3, "reps": 10, "weight": 12 },
        { "set": 4, "reps": 10, "weight": 12 }
      ]
    },
    {
      "name": "Frances",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 10, "weight": 22 },
        { "set": 2, "reps": 10, "weight": 22 },
        { "set": 3, "reps": 10, "weight": 22 },
        { "set": 4, "reps": 10, "weight": 22 }
      ]
    },
    {
      "name": "Polia",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 10, "weight": 35 },
        { "set": 2, "reps": 10, "weight": 40 },
        { "set": 3, "reps": 10, "weight": 45 },
        { "set": 4, "reps": 10, "weight": 40 }
      ]
    },
    {
      "name": "Rosca Cross",
      "rest_seconds": 60,
      "effort": "Pesado",
      "set_plan": [
        { "set": 1, "reps": 8, "weight": 35 },
        { "set": 2, "reps": 8, "weight": 35 },
        { "set": 3, "reps": 8, "weight": 35 },
        { "set": 4, "reps": 8, "weight": 35 }
      ]
    },
    {
      "name": "Triceps Banco",
      "rest_seconds": 60,
      "effort": "Pesado",
      "set_plan": [
        { "set": 1, "reps": 15 },
        { "set": 2, "reps": 15 },
        { "set": 3, "reps": 15 },
        { "set": 4, "reps": 15 }
      ]
    }
  ]'::jsonb
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  muscle_groups = EXCLUDED.muscle_groups,
  intensity = EXCLUDED.intensity,
  rest_seconds = EXCLUDED.rest_seconds,
  exercises = EXCLUDED.exercises;
