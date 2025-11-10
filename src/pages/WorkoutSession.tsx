import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Flame,
  Minus,
  Plus,
  Repeat,
  RotateCcw,
  Timer,
  Weight,
} from "lucide-react";
import {
  firstSetPlanEntry,
  formatMuscleGroupLabel,
  muscleGroupsFromString,
  parseSetPlan,
  SetPlanEntry,
} from "@/lib/training";

type WorkoutRecord = {
  id: string;
  name: string;
  muscle_group: string;
};

type SessionExercise = {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight: number;
  rest_seconds: number;
  order_index: number;
  set_plan: SetPlanEntry[];
};
type ExerciseRow = Tables<"exercises">;

type ProgressMap = Record<string, number>;
type SavingState = Record<string, boolean>;
type RestTimerState = {
  duration: number;
  remaining: number;
  active: boolean;
};

const formatClock = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  const parts = hours > 0 ? [hours, minutes, secs] : [minutes, secs];
  return parts.map((value) => String(value).padStart(2, "0")).join(":");
};

const formatDurationLabel = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  if (minutes > 0) {
    return `${minutes}min ${String(secs).padStart(2, "0")}s`;
  }
  return `${secs}s`;
};

const createRestTimer = (seconds: number): RestTimerState => {
  const duration = Math.max(10, Math.round(seconds) || 60);
  return {
    duration,
    remaining: duration,
    active: false,
  };
};

const volumeFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

const WorkoutSession = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [workout, setWorkout] = useState<WorkoutRecord | null>(null);
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [progressMap, setProgressMap] = useState<ProgressMap>({});
  const [weightOverrides, setWeightOverrides] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<SavingState>({});
  const [loading, setLoading] = useState(true);
  const [restTimers, setRestTimers] = useState<Record<string, RestTimerState>>({});
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [sessionEnd, setSessionEnd] = useState<number | null>(null);
  const [sessionVolume, setSessionVolume] = useState(0);
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      if (!id) {
        navigate("/workouts");
        return;
      }

      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          navigate("/auth");
          return;
        }

        setUserId(session.user.id);

        const { data: workoutData, error: workoutError } = await supabase
          .from("workouts")
          .select("id, name, muscle_group")
          .eq("id", id)
          .eq("user_id", session.user.id)
          .single();

        if (workoutError || !workoutData) {
          toast({
            title: "Treino nÃ£o encontrado",
            description: "NÃ£o foi possÃ­vel carregar este treino.",
            variant: "destructive",
          });
          navigate("/workouts");
          return;
        }

        setWorkout(workoutData);

        const { data: exercisesData, error: exercisesError } = await supabase
          .from("exercises")
          .select("id, name, sets, reps, weight, rest_seconds, order_index, set_plan")
          .eq("workout_id", id)
          .order("order_index", { ascending: true });

        if (exercisesError) {
          toast({
            title: "Erro ao carregar exercÃ­cios",
            description: "NÃ£o foi possÃ­vel carregar os exercÃ­cios deste treino.",
            variant: "destructive",
          });
          setExercises([]);
          setProgressMap({});
        } else {
          const rawExercises = (exercisesData as ExerciseRow[] | null) ?? [];
          const sanitizedExercises: SessionExercise[] = rawExercises.map((exercise) => {
            const plan = parseSetPlan(exercise?.set_plan);
            const firstEntry = firstSetPlanEntry(plan);
            const weight =
              typeof exercise?.weight === "number" && !Number.isNaN(exercise.weight)
                ? exercise.weight
                : firstEntry?.weight ?? 0;
            const reps =
              typeof exercise?.reps === "number" && !Number.isNaN(exercise.reps)
                ? exercise.reps
                : firstEntry?.reps ?? 0;
            const rawSets = Number(exercise?.sets);
            const normalizedSets = Number.isFinite(rawSets) && rawSets > 0 ? rawSets : plan.length || 1;
            const rawRest = Number(exercise?.rest_seconds);

            return {
              id: String(exercise.id),
              name: String(exercise.name),
              sets: normalizedSets,
              reps,
              weight,
              rest_seconds: Number.isFinite(rawRest) && rawRest >= 0 ? rawRest : 60,
              order_index: Number(exercise.order_index) || 0,
              set_plan: plan,
            };
          });
          setExercises(sanitizedExercises);
          setProgressMap((previous) => {
            const next: ProgressMap = {};
            sanitizedExercises.forEach((exercise) => {
              next[exercise.id] = previous[exercise.id] ?? 0;
            });
            return next;
          });
          setWeightOverrides((previous) => {
            const next: Record<string, number> = {};
            sanitizedExercises.forEach((exercise) => {
              const value = previous[exercise.id];
              const defaultWeight = exercise.set_plan[0]?.weight ?? exercise.weight;
              next[exercise.id] =
                typeof value === "number" && !Number.isNaN(value) ? value : defaultWeight;
            });
            return next;
          });
          setRestTimers((previous) => {
            const next: Record<string, RestTimerState> = {};
            sanitizedExercises.forEach((exercise) => {
              const fallback = createRestTimer(exercise.rest_seconds);
              const current = previous[exercise.id];
              if (current) {
                const duration = Math.max(10, current.duration || fallback.duration);
                const remaining = Math.min(duration, current.remaining || duration);
                next[exercise.id] = {
                  duration,
                  remaining,
                  active: current.active,
                };
              } else {
                next[exercise.id] = fallback;
              }
            });
            return next;
          });
        }
      } catch (error) {
        toast({
          title: "Erro inesperado",
          description: "NÃ£o foi possÃ­vel carregar este treino.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void initialize();
  }, [id, navigate, toast]);

  useEffect(() => {
    if (!loading && sessionStart === null) {
      setSessionStart(Date.now());
    }
  }, [loading, sessionStart]);

  useEffect(() => {
    if (sessionStart === null || sessionEnd !== null) {
      return;
    }
    const interval = setInterval(() => {
      setSessionElapsed(Math.floor((Date.now() - sessionStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart, sessionEnd]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRestTimers((previous) => {
        let changed = false;
        const next: Record<string, RestTimerState> = {};
        Object.entries(previous).forEach(([exerciseId, timer]) => {
          if (timer.active && timer.remaining > 0) {
            const remaining = Math.max(0, timer.remaining - 1);
            const active = remaining > 0;
            if (remaining !== timer.remaining || active !== timer.active) {
              changed = true;
            }
            next[exerciseId] = { ...timer, remaining, active };
          } else {
            next[exerciseId] = timer;
          }
        });
        return changed ? next : previous;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const totalSets = useMemo(
    () => exercises.reduce((sum, exercise) => sum + exercise.sets, 0),
    [exercises],
  );

  const completedSets = useMemo(
    () =>
      exercises.reduce((sum, exercise) => {
        const completed = Math.min(progressMap[exercise.id] ?? 0, exercise.sets);
        return sum + completed;
      }, 0),
    [exercises, progressMap],
  );

  const sessionPercentage = totalSets === 0 ? 0 : Math.round((completedSets / totalSets) * 100);

  const nextExercise = useMemo(
    () => exercises.find((exercise) => (progressMap[exercise.id] ?? 0) < exercise.sets) ?? null,
    [exercises, progressMap],
  );

  const workoutFinished = exercises.length > 0 && !nextExercise;

  useEffect(() => {
    if (workoutFinished && sessionEnd === null && sessionStart !== null) {
      setSessionEnd(Date.now());
    }
  }, [workoutFinished, sessionEnd, sessionStart]);

  const displayElapsedSeconds =
    sessionStart === null
      ? 0
      : sessionEnd !== null
        ? Math.floor((sessionEnd - sessionStart) / 1000)
        : sessionElapsed;

  const completedExercises = useMemo(
    () => exercises.filter((exercise) => (progressMap[exercise.id] ?? 0) >= exercise.sets).length,
    [exercises, progressMap],
  );

  const summaryVolumeLabel = `${volumeFormatter.format(sessionVolume)} kg`;
  const summaryDurationLabel = formatDurationLabel(displayElapsedSeconds);
  const pendingSets = Math.max(0, totalSets - completedSets);
  const incompleteExercises = Math.max(0, exercises.length - completedExercises);
  const canFinishWorkout = exercises.length > 0;

  const resolveWeight = useCallback(
    (exercise: SessionExercise) => {
      const value = weightOverrides[exercise.id];
      if (typeof value === "number" && !Number.isNaN(value) && value >= 0) {
        return value;
      }
      return exercise.weight;
    },
    [weightOverrides],
  );

  const handleWeightInputChange = (exerciseId: string, rawValue: string, fallback: number) => {
    setWeightOverrides((previous) => {
      if (rawValue.trim() === "") {
        return { ...previous, [exerciseId]: fallback };
      }

      const parsed = Number(rawValue);
      if (Number.isNaN(parsed)) {
        return previous;
      }

      const safe = Math.max(0, Math.round(parsed * 100) / 100);
      return { ...previous, [exerciseId]: safe };
    });
  };

  const handleAdjustWeight = (exerciseId: string, delta: number, fallback: number) => {
    setWeightOverrides((previous) => {
      const current =
        typeof previous[exerciseId] === "number" && !Number.isNaN(previous[exerciseId])
          ? previous[exerciseId]!
          : fallback;
      const next = Math.max(0, Math.round((current + delta) * 100) / 100);
      return { ...previous, [exerciseId]: next };
    });
  };

  const handleAdjustRest = (exerciseId: string, delta: number, fallback: number) => {
    setRestTimers((previous) => {
      const current = previous[exerciseId] ?? createRestTimer(fallback);
      const duration = Math.max(10, current.duration + delta);
      const remaining = current.active ? Math.min(duration, current.remaining) : duration;
      return {
        ...previous,
        [exerciseId]: {
          ...current,
          duration,
          remaining,
        },
      };
    });
  };

  const handleRestartRest = (exerciseId: string, fallback: number) => {
    setRestTimers((previous) => {
      const current = previous[exerciseId] ?? createRestTimer(fallback);
      const duration = Math.max(10, current.duration || fallback);
      return {
        ...previous,
        [exerciseId]: {
          duration,
          remaining: duration,
          active: true,
        },
      };
    });
  };

  const handleCompleteSet = async (exerciseId: string) => {
    const exercise = exercises.find((item) => item.id === exerciseId);
    if (!exercise) {
      return;
    }

    const currentCount = progressMap[exerciseId] ?? 0;
    if (currentCount >= exercise.sets || saving[exerciseId]) {
      return;
    }

    if (!userId) {
      toast({
        title: "SessÃ£o invÃ¡lida",
        description: "FaÃ§a login novamente para registrar o treino.",
        variant: "destructive",
      });
      return;
    }

    const nextCount = currentCount + 1;
    const planEntry = exercise.set_plan[currentCount];

    setProgressMap((previous) => ({
      ...previous,
      [exerciseId]: nextCount,
    }));

    setSaving((previous) => ({
      ...previous,
      [exerciseId]: true,
    }));

    const currentWeight = resolveWeight(exercise);

    const repsLogged = planEntry?.reps ?? exercise.reps;
    const { error } = await supabase.from("workout_logs").insert({
      exercise_id: exercise.id,
      user_id: userId,
      weight: currentWeight,
      reps: repsLogged,
      sets: 1,
    });

    setSaving((previous) => ({
      ...previous,
      [exerciseId]: false,
    }));

    if (error) {
      setProgressMap((previous) => ({
        ...previous,
        [exerciseId]: currentCount,
      }));

      toast({
        title: "Erro ao registrar",
        description: "NÃ£o foi possÃ­vel registrar a sÃ©rie. Tente novamente.",
        variant: "destructive",
      });
      return;
    }

    setSessionVolume((previous) => previous + currentWeight * repsLogged);

    if (nextCount < exercise.sets) {
      setRestTimers((previous) => {
        const current = previous[exerciseId] ?? createRestTimer(exercise.rest_seconds);
        const duration = Math.max(10, current.duration || exercise.rest_seconds || 60);
        return {
          ...previous,
          [exerciseId]: {
            duration,
            remaining: duration,
            active: true,
          },
        };
      });
      const upcomingWeight = exercise.set_plan[nextCount]?.weight;
      if (typeof upcomingWeight === "number" && !Number.isNaN(upcomingWeight)) {
        setWeightOverrides((previous) => ({
          ...previous,
          [exerciseId]: upcomingWeight,
        }));
      }
    } else {
      setRestTimers((previous) => {
        const current = previous[exerciseId];
        if (!current) {
          return previous;
        }
        return {
          ...previous,
          [exerciseId]: {
            ...current,
            active: false,
            remaining: current.duration,
          },
        };
      });
    }

    if (nextCount === exercise.sets) {
      toast({
        title: "ExercÃ­cio concluÃ­do",
        description: `${exercise.name} registrado no histÃ³rico.`,
      });
    }
  };

  const finalizeWorkout = () => {
    toast({
      title: "Treino finalizado!",
      description: `Duracao ${summaryDurationLabel} - Volume ${summaryVolumeLabel}`,
    });
    navigate("/dashboard");
  };

  const handleFinishWorkoutRequest = () => {
    if (!workoutFinished) {
      setConfirmFinishOpen(true);
      return;
    }
    finalizeWorkout();
  };

  const handleForceFinish = () => {
    setConfirmFinishOpen(false);
    finalizeWorkout();
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-dark flex items-center justify-center">
        <div className="text-center text-muted-foreground">Carregando treino...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-dark">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/workout/${id}`)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{workout?.name ?? "Treino"}</h1>
              <div className="mt-1 flex flex-wrap gap-1">
                {muscleGroupsFromString(workout?.muscle_group).map((group) => {
                  const label = formatMuscleGroupLabel(group);
                  return (
                    <Badge key={group} variant="outline">
                      {label}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
              <Timer className="w-4 h-4 text-primary" />
              <span>{formatClock(displayElapsedSeconds)}</span>
            </div>
            <Button
              onClick={handleFinishWorkoutRequest}
              disabled={!canFinishWorkout}
              className="gradient-secondary shadow-glow-secondary disabled:opacity-60"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Finalizar treino
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card className="shadow-card border-border/60">
          <CardHeader>
            <CardTitle>Progresso do treino</CardTitle>
            <CardDescription>
              {workoutFinished
                ? "Tudo concluÃ­do! Finalize o treino para registrar a sessÃ£o."
                : nextExercise
                  ? `VocÃª estÃ¡ em ${nextExercise.name}.`
                  : "Adicione exercÃ­cios ao treino para comeÃ§ar."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={sessionPercentage} />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {completedSets} de {totalSets} sÃ©ries completas
              </span>
              <span>{sessionPercentage}%</span>
            </div>

            {nextExercise ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">PrÃ³ximo exercÃ­cio</p>
                  <p className="text-lg font-semibold">{nextExercise.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {nextExercise.sets}x{nextExercise.reps} â€¢ {resolveWeight(nextExercise)} kg
                  </p>
                </div>
                <Button
                  onClick={() => handleCompleteSet(nextExercise.id)}
                  className="gradient-primary shadow-glow-primary hover:opacity-90 transition-opacity"
                >
                  Concluir sÃ©rie ({(progressMap[nextExercise.id] ?? 0) + 1}/{nextExercise.sets})
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
                Nenhum exercÃ­cio pendente. Finalize o treino quando estiver pronto.
              </div>
            )}
          </CardContent>
        </Card>
        {workoutFinished && (
          <Card className="shadow-card border-border/60 bg-primary/5">
            <CardHeader>
              <CardTitle>Resumo do treino</CardTitle>
              <CardDescription>Todos os exercÃ­cios foram registrados. Revise e finalize a sessÃ£o.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Timer className="w-4 h-4" />
                    DuraÃ§Ã£o
                  </div>
                  <p className="mt-1 text-2xl font-semibold">{summaryDurationLabel}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Flame className="w-4 h-4" />
                    Volume total
                  </div>
                  <p className="mt-1 text-2xl font-semibold">{summaryVolumeLabel}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="w-4 h-4" />
                    SÃ©ries concluÃ­das
                  </div>
                  <p className="mt-1 text-2xl font-semibold">
                    {completedSets}/{totalSets}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ExercÃ­cios finalizados: {completedExercises}/{exercises.length}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-muted-foreground">
                  Tudo certo! Toque em â€œFinalizar treinoâ€ para salvar o tempo total e voltar ao painel.
                </p>
                <Button
                  onClick={handleFinishWorkoutRequest}
                  className="md:w-auto gradient-secondary shadow-glow-secondary"
                  disabled={!canFinishWorkout}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Finalizar treino
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {exercises.length === 0 ? (
            <Card className="shadow-card border-border/60">
              <CardContent className="py-12 text-center space-y-3">
                <p className="text-muted-foreground">Nenhum exercÃ­cio cadastrado neste treino.</p>
                <Button variant="outline" onClick={() => navigate(`/workout/${id}`)}>
                  Adicionar exercÃ­cios
                </Button>
              </CardContent>
            </Card>
          ) : (
            exercises.map((exercise) => {
              const completed = Math.min(progressMap[exercise.id] ?? 0, exercise.sets);
              const finished = completed >= exercise.sets;
              const restTimer = restTimers[exercise.id];
              const baseRest = Math.max(10, Math.round(exercise.rest_seconds) || 60);
              const restDuration = restTimer?.duration ?? baseRest;
              const restRemaining = restTimer?.remaining ?? restDuration;
              const restActive = restTimer?.active ?? false;
              const restStatus = restActive
                ? restRemaining === 0
                  ? "Descanso concluÃ­do"
                  : "Descanso em andamento"
                : "Pronto para prÃ³xima sÃ©rie";
              const restCountdownLabel = formatClock(restRemaining);

              return (
                <Card key={exercise.id} className="shadow-card border-border/60">
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{exercise.name}</CardTitle>
                      <CardDescription>
                        {exercise.sets} sÃ©ries â€¢ {exercise.reps} repetiÃ§Ãµes
                      </CardDescription>
                    </div>
                    <Badge variant={finished ? "secondary" : "outline"}>
                      {finished ? "ConcluÃ­do" : `SÃ©rie ${completed + 1} de ${exercise.sets}`}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 text-sm text-muted-foreground sm:grid-cols-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Repeat className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide">SÃ©ries x Reps</p>
                          <p className="font-semibold text-foreground">
                            {exercise.sets} x {exercise.reps}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                          <Weight className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide">Carga</p>
                          <p className="font-semibold text-foreground">{resolveWeight(exercise)} kg</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                          <Timer className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide">Descanso</p>
                          <p className="font-semibold text-foreground">{restCountdownLabel}</p>
                          <p className="text-xs text-muted-foreground">{restStatus}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/20 p-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Configurar descanso</p>
                        <p className="text-sm text-muted-foreground">
                          {restActive ? "Contagem ativa" : "Pronto"} Â· alvo atual {restDuration}s
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleAdjustRest(exercise.id, -15, exercise.rest_seconds)}
                          disabled={finished}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="font-mono text-sm text-muted-foreground">{restDuration}s</span>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleAdjustRest(exercise.id, 15, exercise.rest_seconds)}
                          disabled={finished}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestartRest(exercise.id, exercise.rest_seconds)}
                          disabled={finished}
                        >
                          <RotateCcw className="w-4 h-4 mr-1" />
                          Reiniciar
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Peso atual</p>
                        <p className="text-sm text-muted-foreground">
                          Ajuste o peso quando aumentar ou reduzir a carga durante o treino.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleAdjustWeight(exercise.id, -1, exercise.weight)}
                          disabled={finished || saving[exercise.id]}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min="0"
                          className="w-24 text-center"
                          value={resolveWeight(exercise)}
                          onChange={(event) =>
                            handleWeightInputChange(exercise.id, event.target.value, exercise.weight)
                          }
                          disabled={finished || saving[exercise.id]}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleAdjustWeight(exercise.id, 1, exercise.weight)}
                          disabled={finished || saving[exercise.id]}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        {finished ? "ExercÃ­cio finalizado." : `Complete as sÃ©ries para registrar o exercÃ­cio.`}
                      </p>
                      <Button
                        onClick={() => handleCompleteSet(exercise.id)}
                        disabled={finished || saving[exercise.id]}
                        className="sm:w-auto"
                      >
                        {finished ? (
                          <span className="inline-flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            ConcluÃ­do
                          </span>
                        ) : saving[exercise.id] ? (
                          "Registrando..."
                        ) : (
                          `Concluir sÃ©rie (${completed + 1}/${exercise.sets})`
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </main>
      <AlertDialog open={confirmFinishOpen} onOpenChange={setConfirmFinishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar treino incompleto?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSets > 0
                ? `Ainda faltam ${pendingSets} serie(s) em ${incompleteExercises} exercicio(s). Tem certeza que deseja encerrar agora?`
                : "Deseja finalizar o treino agora?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar treino</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceFinish}>Finalizar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkoutSession;

