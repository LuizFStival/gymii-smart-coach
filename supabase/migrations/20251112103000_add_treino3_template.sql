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
  'treino-3-abdominal-aerobico-ombro',
  'Treino 3 (Abdominal, Aerobico e Ombro)',
  'Combo rapido com aquecimento aerobico, foco em ombros e finalizacao abdominal.',
  ARRAY['Abdomen', 'Aerobico', 'Ombros'],
  'Moderado',
  60,
  '[
    {
      "name": "Eliptico",
      "rest_seconds": 60,
      "effort": "Leve",
      "set_plan": [
        { "set": 1, "reps": 15 }
      ]
    },
    {
      "name": "Remada em pe cross",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 12, "weight": 45 },
        { "set": 2, "reps": 10, "weight": 50 },
        { "set": 3, "reps": 8, "weight": 55 },
        { "set": 4, "reps": 6, "weight": 60 },
        { "set": 5, "reps": 6, "weight": 60 },
        { "set": 6, "reps": 8, "weight": 55 },
        { "set": 7, "reps": 10, "weight": 50 },
        { "set": 8, "reps": 12, "weight": 45 }
      ]
    },
    {
      "name": "Desenvolvimento Halteres",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 8, "weight": 20 },
        { "set": 2, "reps": 10, "weight": 18 },
        { "set": 3, "reps": 12, "weight": 16 },
        { "set": 4, "reps": 14, "weight": 14 }
      ]
    },
    {
      "name": "Elevacao Lateral",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 8, "weight": 9 },
        { "set": 2, "reps": 10, "weight": 8 },
        { "set": 3, "reps": 12, "weight": 7 },
        { "set": 4, "reps": 14, "weight": 6 }
      ]
    },
    {
      "name": "Crucifixo Inverso",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 8, "weight": 5 },
        { "set": 2, "reps": 10, "weight": 5 },
        { "set": 3, "reps": 12, "weight": 5 }
      ]
    },
    {
      "name": "Obliquo Banco",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 20 },
        { "set": 2, "reps": 20 },
        { "set": 3, "reps": 20 }
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
