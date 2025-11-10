import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Dumbbell, Edit, Trash2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import WorkoutDialog from "@/components/WorkoutDialog";
import {
  firstSetPlanEntry,
  formatMuscleGroupLabel,
  muscleGroupsFromString,
  parseSetPlan,
  stringifyMuscleGroups,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from "@/lib/training";

interface Workout {
  id: string;
  name: string;
  muscle_group: string;
  created_at: string;
}

const parseTemplateExercises = (value: unknown): WorkoutTemplateExercise[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const set_plan = parseSetPlan(record.set_plan);
      const rest_seconds_raw = record.rest_seconds;
      const rest_seconds =
        typeof rest_seconds_raw === "number"
          ? rest_seconds_raw
          : typeof rest_seconds_raw === "string"
            ? Number(rest_seconds_raw)
            : null;

      return {
        name: typeof record.name === "string" ? record.name : "Exercício",
        rest_seconds: Number.isFinite(rest_seconds || NaN) ? rest_seconds : null,
        effort: typeof record.effort === "string" ? record.effort : null,
        set_plan,
      };
    })
    .filter((exercise): exercise is WorkoutTemplateExercise => Boolean(exercise));
};

const normalizeTemplate = (payload: any): WorkoutTemplate => {
  const muscle_groups = Array.isArray(payload?.muscle_groups)
    ? payload.muscle_groups.map((item: unknown) => String(item))
    : [];

  const rest_seconds =
    typeof payload?.rest_seconds === "number"
      ? payload.rest_seconds
      : typeof payload?.rest_seconds === "string"
        ? Number(payload.rest_seconds)
        : null;

  const duration_minutes =
    typeof payload?.duration_minutes === "number"
      ? payload.duration_minutes
      : typeof payload?.duration_minutes === "string"
        ? Number(payload.duration_minutes)
        : null;

  return {
    id: String(payload?.id ?? ""),
    slug: String(payload?.slug ?? ""),
    name: String(payload?.name ?? "Treino"),
    description: payload?.description ? String(payload.description) : null,
    muscle_groups,
    intensity: payload?.intensity ? String(payload.intensity) : null,
    rest_seconds: Number.isFinite(rest_seconds || NaN) ? rest_seconds : null,
    duration_minutes: Number.isFinite(duration_minutes || NaN) ? duration_minutes : null,
    exercises: parseTemplateExercises(payload?.exercises),
  };
};

const Workouts = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [workoutsLoading, setWorkoutsLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateImporting, setTemplateImporting] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);

  const fetchWorkouts = useCallback(async () => {
    setWorkoutsLoading(true);
    const { data, error } = await supabase
      .from("workouts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar os treinos",
        variant: "destructive",
      });
    } else {
      setWorkouts(data || []);
    }
    setWorkoutsLoading(false);
  }, [toast]);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    const { data, error } = await supabase
      .from("workout_templates")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      toast({
        title: "Erro ao carregar templates",
        description: "Não foi possível carregar os treinos coringa.",
        variant: "destructive",
      });
    } else {
      setTemplates((data || []).map(normalizeTemplate));
    }
    setTemplatesLoading(false);
  }, [toast]);

  useEffect(() => {
    const initialize = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/auth");
        return;
      }

      await Promise.all([fetchWorkouts(), fetchTemplates()]);
    };

    void initialize();
  }, [fetchTemplates, fetchWorkouts, navigate]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("workouts").delete().eq("id", id);

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível excluir o treino",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Sucesso",
        description: "Treino excluído com sucesso",
      });
      fetchWorkouts();
    }
  };

  const handleEdit = (workout: Workout) => {
    setEditingWorkout(workout);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingWorkout(null);
    fetchWorkouts();
  };

  const handleImportTemplate = async (template: WorkoutTemplate) => {
    setTemplateImporting(template.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/auth");
        return;
      }

      const muscleGroupValue = stringifyMuscleGroups(template.muscle_groups);

      const { data: workoutData, error: workoutError } = await supabase
        .from("workouts")
        .insert({
          name: template.name,
          muscle_group: muscleGroupValue,
          user_id: session.user.id,
        })
        .select()
        .single();

      if (workoutError || !workoutData) {
        throw new Error(workoutError?.message || "Não foi possível criar o treino.");
      }

      const exercisePayload = template.exercises.map((exercise, index) => {
        const plan = exercise.set_plan ?? [];
        const firstEntry = firstSetPlanEntry(plan);
        const restSeconds =
          typeof exercise.rest_seconds === "number"
            ? exercise.rest_seconds
            : typeof template.rest_seconds === "number"
              ? template.rest_seconds
              : 60;

        return {
          workout_id: workoutData.id,
          name: exercise.name,
          sets: plan.length > 0 ? plan.length : 3,
          reps: firstEntry?.reps ?? 10,
          weight: firstEntry?.weight ?? 0,
          rest_seconds: restSeconds,
          order_index: index,
          set_plan: plan.length > 0 ? plan : null,
        };
      });

      if (exercisePayload.length > 0) {
        const { error: exercisesError } = await supabase.from("exercises").insert(exercisePayload);
        if (exercisesError) {
          throw new Error(exercisesError.message);
        }
      }

      toast({
        title: "Treino importado",
        description: "O template foi adicionado à sua lista.",
      });

      fetchWorkouts();
    } catch (error: any) {
      toast({
        title: "Erro ao importar",
        description: error.message ?? "Não foi possível importar o template.",
        variant: "destructive",
      });
    } finally {
      setTemplateImporting(null);
    }
  };

  const isLoading = workoutsLoading && templatesLoading;

  const renderMuscleBadges = useCallback((value: string | string[]) => {
    const groups = Array.isArray(value) ? value : muscleGroupsFromString(value);
    if (groups.length === 0) {
      return <Badge variant="outline">Não definido</Badge>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {groups.map((group) => {
          const label = formatMuscleGroupLabel(group);
          return (
            <Badge key={group} variant="outline">
              {label}
            </Badge>
          );
        })}
      </div>
    );
  }, []);

  const hasTemplates = !templatesLoading && templates.length > 0;

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-dark flex items-center justify-center">
        <Dumbbell className="w-12 h-12 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-dark">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold">Meus Treinos</h1>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gradient-primary shadow-glow-primary">
            <Plus className="w-4 h-4 mr-2" />
            Novo Treino
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {hasTemplates && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Treinos Coringa
                </h2>
                <p className="text-sm text-muted-foreground">
                  Use um plano pronto para acelerar sua programação de treinos.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {templates.map((template) => (
                <Card key={template.id} className="shadow-card border-border/50 hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    {template.description && <CardDescription>{template.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {renderMuscleBadges(template.muscle_groups)}
                    <div className="space-y-2">
                      {template.exercises.map((exercise, index) => {
                        const plan = exercise.set_plan ?? [];
                        const planSummary = plan
                          .map((set) => {
                            const repsLabel = set.reps ? `${set.reps} reps` : "reps";
                            const weightLabel = set.weight ? `${set.weight} kg` : "peso livre";
                            return `${repsLabel} · ${weightLabel}`;
                          })
                          .join(" | ");

                        return (
                          <div key={`${template.id}-${exercise.name}-${index}`} className="rounded-lg border border-border/60 bg-card/30 p-3">
                            <p className="font-semibold text-sm">{exercise.name}</p>
                            <p className="text-xs text-muted-foreground">{planSummary || "Séries personalizáveis"}</p>
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      onClick={() => handleImportTemplate(template)}
                      disabled={templateImporting === template.id}
                      className="w-full gradient-secondary shadow-glow-secondary"
                    >
                      {templateImporting === template.id ? "Importando..." : "Adicionar aos meus treinos"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {workouts.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Dumbbell className="w-16 h-16 text-muted-foreground mx-auto" />
            <h3 className="text-xl font-semibold text-muted-foreground">Nenhum treino cadastrado</h3>
            <p className="text-sm text-muted-foreground">Crie ou importe um treino para começar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workouts.map((workout) => (
              <Card key={workout.id} className="shadow-card border-border/50 hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span className="truncate">{workout.name}</span>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(workout)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(workout.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Dumbbell className="w-4 h-4" />
                    {renderMuscleBadges(workout.muscle_group)}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => navigate(`/execute/${workout.id}`)}
                      className="w-full gradient-secondary shadow-glow-secondary hover:opacity-90 transition-opacity"
                    >
                      Iniciar Treino
                    </Button>
                    <Button onClick={() => navigate(`/workout/${workout.id}`)} className="w-full" variant="outline">
                      Ver Detalhes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <WorkoutDialog open={dialogOpen} onOpenChange={handleDialogClose} workout={editingWorkout} />
    </div>
  );
};

export default Workouts;
