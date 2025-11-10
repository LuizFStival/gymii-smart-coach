export type SetPlanEntry = {
  set?: number;
  reps?: number;
  weight?: number;
};

export const parseSetPlan = (value: unknown): SetPlanEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const set =
          typeof record.set === "number"
            ? record.set
            : typeof record.set === "string"
              ? Number(record.set)
              : index + 1;
        const reps =
          typeof record.reps === "number"
            ? record.reps
            : typeof record.reps === "string"
              ? Number(record.reps)
              : undefined;
        const weight =
          typeof record.weight === "number"
            ? record.weight
            : typeof record.weight === "string"
              ? Number(record.weight)
              : undefined;

        return {
          set: Number.isFinite(set) ? set : index + 1,
          reps: Number.isFinite(reps || NaN) ? reps : undefined,
          weight: Number.isFinite(weight || NaN) ? weight : undefined,
        };
      }

      return {
        set: index + 1,
      };
    })
    .map((entry, index) => ({
      set: entry.set ?? index + 1,
      reps: typeof entry.reps === "number" && !Number.isNaN(entry.reps) ? entry.reps : undefined,
      weight: typeof entry.weight === "number" && !Number.isNaN(entry.weight) ? entry.weight : undefined,
    }));
};

export const firstSetPlanEntry = (plan: SetPlanEntry[]): SetPlanEntry | undefined => {
  return plan.length > 0 ? plan[0] : undefined;
};

export const muscleGroupsFromString = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

export const stringifyMuscleGroups = (groups: string[]): string => {
  return groups.join(", ");
};

const MUSCLE_GROUP_LABELS: Record<string, string> = {
  Aerobico: "Aer\u00F3bico",
  Biceps: "B\u00EDceps",
  Triceps: "Tr\u00EDceps",
  Abdomen: "Abd\u00F4men",
};

export const formatMuscleGroupLabel = (value: string): string => {
  return MUSCLE_GROUP_LABELS[value] ?? value;
};

export type WorkoutTemplateExercise = {
  name: string;
  rest_seconds?: number | null;
  effort?: string | null;
  set_plan?: SetPlanEntry[];
};

export type WorkoutTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  muscle_groups: string[];
  intensity: string | null;
  rest_seconds: number | null;
  duration_minutes: number | null;
  exercises: WorkoutTemplateExercise[];
};
