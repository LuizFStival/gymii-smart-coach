-- Add optional set_plan metadata for exercises
ALTER TABLE public.exercises
ADD COLUMN IF NOT EXISTS set_plan JSONB;

-- Templates table to store reusable workouts
CREATE TABLE IF NOT EXISTS public.workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  muscle_groups TEXT[] NOT NULL,
  intensity TEXT,
  rest_seconds INTEGER DEFAULT 60,
  duration_minutes INTEGER,
  exercises JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.workout_templates
ADD CONSTRAINT workout_templates_exercises_array CHECK (jsonb_typeof(exercises) = 'array');

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates are viewable by everyone"
  ON public.workout_templates FOR SELECT
  USING (true);

CREATE POLICY "Templates write restricted"
  ON public.workout_templates FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Templates update restricted"
  ON public.workout_templates FOR UPDATE
  USING (false);

CREATE POLICY "Templates delete restricted"
  ON public.workout_templates FOR DELETE
  USING (false);

-- Seed the default template (idempotent)
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
  'treino-2-aerobico-pernas',
  'Treino 2 (Aerobico, Pernas)',
  'Plano coringa focado em resistencia cardiovascular e fortalecimento de pernas.',
  ARRAY['Aerobico', 'Pernas'],
  'Moderado',
  60,
  '[
    {
      "name": "Leg press",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 8,  "weight": 170 },
        { "set": 2, "reps": 10, "weight": 150 },
        { "set": 3, "reps": 12, "weight": 140 }
      ]
    },
    {
      "name": "Agachamento Smith",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 8,  "weight": 26 },
        { "set": 2, "reps": 10, "weight": 23 },
        { "set": 3, "reps": 12, "weight": 20 }
      ]
    },
    {
      "name": "Extensor",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 8,  "weight": 50 },
        { "set": 2, "reps": 10, "weight": 45 },
        { "set": 3, "reps": 12, "weight": 40 }
      ]
    },
    {
      "name": "Flexor",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 8,  "weight": 45 },
        { "set": 2, "reps": 10, "weight": 40 },
        { "set": 3, "reps": 12, "weight": 35 }
      ]
    },
    {
      "name": "Panturrilha Leg",
      "rest_seconds": 60,
      "effort": "Moderado",
      "set_plan": [
        { "set": 1, "reps": 10, "weight": 80 },
        { "set": 2, "reps": 12, "weight": 75 },
        { "set": 3, "reps": 14, "weight": 70 }
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
