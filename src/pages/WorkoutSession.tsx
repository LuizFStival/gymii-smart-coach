import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, UNSAFE_NavigationContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SessionStatus, useWorkoutTimer } from "@/contexts/WorkoutContext";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Flame,
  Minus,
  Plus,
  Repeat,
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
import { SESSION_STORAGE_PREFIX, SESSION_STORAGE_VERSION } from "@/lib/workoutSessionStorage";

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

type PersistedSessionState = {
  version: number;
  workoutId: string;
  workoutName: string | null;
  userId: string;
  sessionStart: number | null;
  sessionEnd: number | null;
  sessionStatus: SessionStatus;
  sessionVolume: number;
  progressMap: ProgressMap;
  weightOverrides: Record<string, number>;
  restTimers: Record<string, RestTimerState>;
  lastUpdated: number;
  activeExerciseId: string | null;
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

const sanitizeProgressMapState = (
  raw: ProgressMap | null | undefined,
  exercises: SessionExercise[],
): ProgressMap => {
  const safe: ProgressMap = {};
  exercises.forEach((exercise) => {
    const value = raw?.[exercise.id];
    if (typeof value === "number" && Number.isFinite(value)) {
      safe[exercise.id] = Math.max(0, Math.min(exercise.sets, Math.round(value)));
    } else {
      safe[exercise.id] = 0;
    }
  });
  return safe;
};

const sanitizeWeightOverridesState = (
  raw: Record<string, number> | null | undefined,
  exercises: SessionExercise[],
): Record<string, number> => {
  const safe: Record<string, number> = {};
  exercises.forEach((exercise) => {
    const fallback = exercise.set_plan[0]?.weight ?? exercise.weight;
    const value = raw?.[exercise.id];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      safe[exercise.id] = Math.round(value * 100) / 100;
    } else {
      safe[exercise.id] = fallback;
    }
  });
  return safe;
};

const sanitizeRestTimersState = (
  raw: Record<string, RestTimerState> | null | undefined,
  exercises: SessionExercise[],
  secondsSinceUpdate: number,
): Record<string, RestTimerState> => {
  const safe: Record<string, RestTimerState> = {};
  exercises.forEach((exercise) => {
    const fallback = createRestTimer(exercise.rest_seconds);
    const timer = raw?.[exercise.id];
    if (!timer) {
      safe[exercise.id] = fallback;
      return;
    }

    const duration = Math.max(10, timer.duration || fallback.duration);
    let remaining = Math.min(duration, Math.max(0, timer.remaining ?? duration));
    let active = Boolean(timer.active);

    if (active && secondsSinceUpdate > 0) {
      remaining = Math.max(0, remaining - secondsSinceUpdate);
      active = remaining > 0;
    }

    safe[exercise.id] = {
      duration,
      remaining,
      active,
    };
  });
  return safe;
};

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
  const [sessionEnd, setSessionEnd] = useState<number | null>(null);
  const [sessionVolume, setSessionVolume] = useState(0);
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [sessionStateHydrated, setSessionStateHydrated] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("idle");
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const { elapsedSeconds: timerElapsed, startTimer, finishTimer, resetTimer, syncTimer } = useWorkoutTimer();

  const storageKey = useMemo(() => {
    if (!userId || !id) {
      return null;
    }
    return `${SESSION_STORAGE_PREFIX}:${userId}:${id}`;
  }, [userId, id]);

  const restTickRef = useRef<number>(Date.now());
  const navigationContext = useContext(UNSAFE_NavigationContext);
  const routerNavigator = navigationContext?.navigator as { block?: (blocker: (tx: { retry: () => void }) => void) => () => void } | undefined;

  useEffect(
    () => () => {
      resetTimer();
    },
    [resetTimer],
  );

  useEffect(() => {
    const shouldBlock = sessionStatus === "in_progress";
    if (!shouldBlock || typeof routerNavigator?.block !== "function") {
      setExitPromptOpen(false);
      setPendingNavigation(null);
      return;
    }
    const unblock = routerNavigator.block((tx: { retry: () => void }) => {
      const retry = () => {
        unblock();
        tx.retry();
      };
      setPendingNavigation(() => retry);
      setExitPromptOpen(true);
    });
    return () => {
      unblock();
      setPendingNavigation(null);
    };
  }, [routerNavigator, sessionStatus]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (sessionStatus === "in_progress") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [sessionStatus]);

  const applyRestTimerDelta = useCallback(
    (deltaSeconds: number) => {
      if (deltaSeconds <= 0) {
        return;
      }
      setRestTimers((previous) => {
        let changed = false;
        const next: Record<string, RestTimerState> = {};
        Object.entries(previous).forEach(([exerciseId, timer]) => {
          if (timer.active && timer.remaining > 0) {
            const remaining = Math.max(0, timer.remaining - deltaSeconds);
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
    },
    [],
  );

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
            title: "Treino não encontrado",
            description: "Não foi possível carregar este treino.",
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
            title: "Erro ao carregar exercícios",
            description: "Não foi possível carregar os exercícios deste treino.",
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
          description: "Não foi possível carregar este treino.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void initialize();
  }, [id, navigate, toast]);

  useEffect(() => {
    if (!sessionStateHydrated && !loading && !storageKey && !userId) {
      setSessionStateHydrated(true);
    }
  }, [loading, storageKey, sessionStateHydrated, userId]);

  useEffect(() => {
    if (!storageKey || loading || sessionStateHydrated) {
      return;
    }

    if (typeof window === "undefined") {
      setSessionStateHydrated(true);
      return;
    }

    const rawState = window.localStorage.getItem(storageKey);

    if (!rawState) {
      setSessionStateHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(rawState) as PersistedSessionState;

      if (
        parsed.version !== SESSION_STORAGE_VERSION ||
        parsed.userId !== userId ||
        parsed.workoutId !== id
      ) {
        window.localStorage.removeItem(storageKey);
        setSessionStateHydrated(true);
        return;
      }

      if (typeof parsed.sessionStart === "number") {
        setSessionStart(parsed.sessionStart);
        setSessionElapsed(Math.max(0, Math.floor((Date.now() - parsed.sessionStart) / 1000)));
      }

      if (typeof parsed.sessionEnd === "number") {
        setSessionEnd(parsed.sessionEnd);
      }

      if (typeof parsed.sessionVolume === "number" && Number.isFinite(parsed.sessionVolume)) {
        setSessionVolume(parsed.sessionVolume);
      }

      const lastUpdated =
        typeof parsed.lastUpdated === "number"
          ? parsed.lastUpdated
          : parsed.sessionStart ?? Date.now();
      const secondsSinceUpdate =
        parsed.sessionEnd !== null
          ? 0
          : Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000));

      const storedProgress = sanitizeProgressMapState(parsed.progressMap, exercises);
      const storedWeights = sanitizeWeightOverridesState(parsed.weightOverrides, exercises);
      const storedTimers = sanitizeRestTimersState(parsed.restTimers, exercises, secondsSinceUpdate);

      setProgressMap(storedProgress);
      setWeightOverrides(storedWeights);
      setRestTimers(storedTimers);
      setActiveExerciseId(typeof parsed.activeExerciseId === "string" ? parsed.activeExerciseId : null);
      const normalizedStatus: SessionStatus =
        parsed.sessionStatus === "in_progress" || parsed.sessionStatus === "completed"
          ? parsed.sessionStatus
          : parsed.sessionStatus === "idle"
            ? "idle"
            : parsed.sessionStart
              ? parsed.sessionEnd
                ? "completed"
                : "in_progress"
              : "idle";
      setSessionStatus(normalizedStatus);
    } catch (error) {
      console.error("Failed to restore workout session state", error);
      window.localStorage.removeItem(storageKey);
    } finally {
      setSessionStateHydrated(true);
    }
  }, [storageKey, loading, sessionStateHydrated, exercises, id, userId]);

  useEffect(() => {
    if (!activeExerciseId) {
      return;
    }
    const exercise = exercises.find((item) => item.id === activeExerciseId);
    if (!exercise) {
      setActiveExerciseId(null);
      return;
    }
    const completed = progressMap[activeExerciseId] ?? 0;
    if (completed >= exercise.sets) {
      setActiveExerciseId(null);
    }
  }, [activeExerciseId, exercises, progressMap]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      const now = Date.now();
      const diff = now - restTickRef.current;
      if (diff >= 1000) {
        const elapsedSeconds = Math.floor(diff / 1000);
        restTickRef.current = now;
        applyRestTimerDelta(elapsedSeconds);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [applyRestTimerDelta]);

  useEffect(() => {
    restTickRef.current = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = now - restTickRef.current;
      if (diff < 1000) {
        return;
      }
      const elapsedSeconds = Math.floor(diff / 1000);
      restTickRef.current = now;
      applyRestTimerDelta(elapsedSeconds);
    }, 1000);

    return () => clearInterval(interval);
  }, [applyRestTimerDelta]);

  useEffect(() => {
    if (!sessionStateHydrated) {
      return;
    }
    syncTimer({
      status: sessionStatus,
      start: sessionStart,
      end: sessionEnd,
    });
  }, [sessionStateHydrated, sessionStatus, sessionStart, sessionEnd, syncTimer]);

  useEffect(() => {
    if (
      !storageKey ||
      !sessionStateHydrated ||
      sessionStart === null ||
      typeof window === "undefined"
    ) {
      return;
    }

    const payload: PersistedSessionState = {
      version: SESSION_STORAGE_VERSION,
      workoutId: id ?? "",
      workoutName: workout?.name ?? null,
      userId: userId ?? "",
      sessionStart,
      sessionEnd,
      sessionStatus,
      sessionVolume,
      progressMap,
      weightOverrides,
      restTimers,
      lastUpdated: Date.now(),
      activeExerciseId,
    };

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn("Não foi possível salvar o treino em andamento", error);
    }
  }, [
    storageKey,
    sessionStateHydrated,
    sessionStart,
    sessionEnd,
    sessionStatus,
    sessionVolume,
    progressMap,
    weightOverrides,
    restTimers,
    activeExerciseId,
    id,
    userId,
    workout?.name,
  ]);

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

  const pendingExercises = useMemo(
    () => exercises.filter((exercise) => (progressMap[exercise.id] ?? 0) < exercise.sets),
    [exercises, progressMap],
  );

  const nextExercise = pendingExercises[0] ?? null;

  const activeExercise = useMemo(() => {
    if (sessionStatus !== "in_progress") {
      return null;
    }
    if (!activeExerciseId) {
      return nextExercise;
    }
    return exercises.find((exercise) => exercise.id === activeExerciseId) ?? nextExercise;
  }, [activeExerciseId, exercises, nextExercise, sessionStatus]);

  const focusExerciseId =
    sessionStatus === "in_progress" ? activeExercise?.id ?? nextExercise?.id ?? null : null;

  const selectValue =
    sessionStatus === "in_progress" ? activeExerciseId ?? nextExercise?.id ?? "__auto__" : "__auto__";

  const workoutFinished = exercises.length > 0 && !nextExercise;

  const displayElapsedSeconds = sessionStatus === "idle" ? 0 : timerElapsed;

  const completedExercises = useMemo(
    () => exercises.filter((exercise) => (progressMap[exercise.id] ?? 0) >= exercise.sets).length,
    [exercises, progressMap],
  );

  const summaryVolumeLabel = `${volumeFormatter.format(sessionVolume)} kg`;
  const summaryDurationLabel = formatDurationLabel(displayElapsedSeconds);
  const pendingSets = Math.max(0, totalSets - completedSets);
  const incompleteExercises = Math.max(0, exercises.length - completedExercises);
  const canFinishWorkout = exercises.length > 0 && sessionStatus !== "idle";
  const totalExercises = exercises.length;
  const remainingExercises = Math.max(0, totalExercises - completedExercises);
  const headerProgressLabel =
    totalExercises > 0
      ? `${completedExercises}/${totalExercises} concluídos (${remainingExercises} restantes)`
      : "Nenhum exercício cadastrado";

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

  const persistExerciseWeight = useCallback(
    async (exerciseId: string, nextWeight: number, previousWeight: number) => {
      if (!Number.isFinite(nextWeight) || Math.abs(nextWeight - previousWeight) < 0.01) {
        return;
      }
      try {
        const { error } = await supabase.from("exercises").update({ weight: nextWeight }).eq("id", exerciseId);
        if (error) {
          console.warn("Não foi possível atualizar a carga do exercício", error);
          return;
        }
        setExercises((current) =>
          current.map((exercise) => (exercise.id === exerciseId ? { ...exercise, weight: nextWeight } : exercise)),
        );
      } catch (error) {
        console.warn("Erro inesperado ao salvar a carga do exercício", error);
      }
    },
    [setExercises],
  );

  const persistPendingWeightOverrides = useCallback(async () => {
    const tasks = exercises
      .map((exercise) => {
        const override = weightOverrides[exercise.id];
        if (typeof override !== "number" || Number.isNaN(override)) {
          return null;
        }
        const normalized = Math.max(0, Math.round(override * 100) / 100);
        if (Math.abs(normalized - exercise.weight) < 0.01) {
          return null;
        }
        return persistExerciseWeight(exercise.id, normalized, exercise.weight);
      })
      .filter((entry): entry is Promise<void> => Boolean(entry));
    if (tasks.length === 0) {
      return;
    }
    try {
      await Promise.all(tasks);
    } catch (error) {
      console.warn("Falha ao salvar as cargas atualizadas antes de finalizar o treino", error);
    }
  }, [exercises, weightOverrides, persistExerciseWeight]);

  const clearPersistedSession = useCallback(() => {
    if (!storageKey || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn("Não foi possível limpar o estado do treino", error);
    }
  }, [storageKey]);

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

  const handleCompleteSet = async (exerciseId: string) => {
    const exercise = exercises.find((item) => item.id === exerciseId);
    if (!exercise) {
      return;
    }

    if (sessionStatus !== "in_progress") {
      toast({
        title: "Comece o treino",
        description: "Use o botão \"Iniciar treino\" antes de registrar as séries.",
        variant: "destructive",
      });
      return;
    }

    const currentCount = progressMap[exerciseId] ?? 0;
    if (currentCount >= exercise.sets || saving[exerciseId]) {
      return;
    }

    if (!userId) {
      toast({
        title: "Sessão inválida",
        description: "Faça login novamente para registrar o treino.",
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
        description: "Não foi possível registrar a série. Tente novamente.",
        variant: "destructive",
      });
      return;
    }

    void persistExerciseWeight(exercise.id, currentWeight, exercise.weight);
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
        title: "Exercício concluído",
        description: `${exercise.name} registrado no histórico.`,
      });
    }
  };

  const handleStartWorkout = () => {
    if (sessionStatus !== "idle" || exercises.length === 0) {
      return;
    }
    const startAt = Date.now();
    setSessionStart(startAt);
    setSessionEnd(null);
    setSessionStatus("in_progress");
    startTimer(startAt);
  };

  const finalizeWorkout = useCallback(async () => {
    await persistPendingWeightOverrides();
    const finalEnd = sessionEnd ?? Date.now();
    setSessionStatus("completed");
    setSessionEnd(finalEnd);
    finishTimer(finalEnd);
    clearPersistedSession();
    toast({
      title: "Treino finalizado!",
      description: `Duracao ${summaryDurationLabel} - Volume ${summaryVolumeLabel}`,
    });
    navigate("/dashboard");
  }, [
    persistPendingWeightOverrides,
    sessionEnd,
    finishTimer,
    clearPersistedSession,
    toast,
    summaryDurationLabel,
    summaryVolumeLabel,
    navigate,
    setSessionStatus,
  ]);

  const handleFinishWorkoutRequest = () => {
    if (sessionStatus === "idle") {
      toast({
        title: "Comece o treino",
        description: 'Pressione "Iniciar treino" antes de finalizar.',
        variant: "destructive",
      });
      return;
    }
    if (!workoutFinished) {
      setConfirmFinishOpen(true);
      return;
    }
    void finalizeWorkout();
  };

  const handleForceFinish = () => {
    setConfirmFinishOpen(false);
    void finalizeWorkout();
  };

  const handleConfirmNavigationExit = () => {
    setExitPromptOpen(false);
    const next = pendingNavigation;
    setPendingNavigation(null);
    next?.();
  };

  const handleCancelNavigationExit = () => {
    setExitPromptOpen(false);
    setPendingNavigation(null);
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
      <header className="sticky top-0 z-40 border-b border-border bg-card/60 backdrop-blur">
        <div className="container mx-auto flex flex-wrap items-start justify-between gap-4 px-4 py-4">
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
          <div className="flex w-full flex-col gap-2 text-left sm:w-auto sm:items-end sm:text-right">
            <div className="flex flex-col items-start gap-1 font-mono text-sm text-muted-foreground sm:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <Timer className="w-4 h-4 text-primary" />
                <span>{formatClock(displayElapsedSeconds)}</span>
              </div>
              <span className="text-xs text-muted-foreground">{headerProgressLabel}</span>
            </div>
            {sessionStatus === "idle" ? (
              <Button
                className="w-full gradient-primary shadow-glow-primary disabled:opacity-60 sm:w-auto"
                onClick={handleStartWorkout}
                disabled={exercises.length === 0}
              >
                Iniciar treino
              </Button>
            ) : (
              <Button
                className="w-full gradient-secondary shadow-glow-secondary disabled:opacity-60 sm:w-auto"
                onClick={handleFinishWorkoutRequest}
                disabled={!canFinishWorkout}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Finalizar treino
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card className="shadow-card border-border/60">
          <CardHeader>
            <CardTitle>Progresso do treino</CardTitle>
            <CardDescription>
              {workoutFinished
                ? "Tudo concluído! Finalize o treino para registrar a sessão."
                : exercises.length === 0
                  ? "Adicione exercícios ao treino para começar."
                  : sessionStatus === "idle"
                    ? 'Pressione "Iniciar treino" para liberar os exercícios.'
                    : activeExercise
                      ? `Você está trabalhando em ${activeExercise.name}. Troque o exercício em foco abaixo conforme a disponibilidade dos equipamentos.`
                      : "Selecione um exercício para iniciar."
              }
                        </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={sessionPercentage} />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {completedSets} de {totalSets} séries completas
              </span>
              <span>{sessionPercentage}%</span>
            </div>

            {exercises.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Exercício em foco
                </Label>
                <Select
                  value={selectValue}
                  onValueChange={(value) => setActiveExerciseId(value === "__auto__" ? null : value)}
                >
                  <SelectTrigger
                    className="w-full"
                    disabled={pendingExercises.length === 0 || sessionStatus !== "in_progress"}
                  >
                    <SelectValue placeholder="Selecione o exercício que deseja executar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">
                      {pendingExercises.length === 0
                        ? "Todos os exercícios foram concluídos"
                        : `Sugestão automática (${pendingExercises[0]?.name ?? "próximo disponível"})`}
                    </SelectItem>
                    {exercises.map((exercise) => {
                      const completed = Math.min(progressMap[exercise.id] ?? 0, exercise.sets);
                      const finished = completed >= exercise.sets;
                      const label = finished
                        ? `${exercise.name} (concluído)`
                        : `${exercise.name} (${completed}/${exercise.sets})`;
                      return (
                        <SelectItem key={exercise.id} value={exercise.id} disabled={finished}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {sessionStatus === "idle"
                    ? 'Inicie o treino para selecionar qual exercício deseja executar primeiro.'
                    : "Escolha outro exercício caso o equipamento atual esteja ocupado."}
                </p>
              </div>
            )}

            {activeExercise ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Exercício em execução</p>
                  <p className="text-lg font-semibold">{activeExercise.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {activeExercise.sets}x{activeExercise.reps} • {resolveWeight(activeExercise)} kg
                  </p>
                </div>
                <Button
                  onClick={() => handleCompleteSet(activeExercise.id)}
                  className="gradient-primary shadow-glow-primary hover:opacity-90 transition-opacity"
                  disabled={saving[activeExercise.id] || (progressMap[activeExercise.id] ?? 0) >= activeExercise.sets}
                >
                  {saving[activeExercise.id]
                    ? "Registrando..."
                    : `Concluir série (${Math.min((progressMap[activeExercise.id] ?? 0) + 1, activeExercise.sets)}/${
                        activeExercise.sets
                      })`}
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
                {exercises.length === 0
                  ? "Adicione exercícios ao treino para começar."
                  : sessionStatus === "idle"
                    ? 'Inicie o treino para liberar a execução dos exercícios.'
                    : "Nenhum exercício pendente. Finalize o treino quando estiver pronto."}
              </div>
            )}
          </CardContent>
        </Card>
        {workoutFinished && (
          <Card className="shadow-card border-border/60 bg-primary/5">
            <CardHeader>
              <CardTitle>Resumo do treino</CardTitle>
              <CardDescription>Todos os exercícios foram registrados. Revise e finalize a sessão.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Timer className="w-4 h-4" />
                    Duração
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
                    Séries concluídas
                  </div>
                  <p className="mt-1 text-2xl font-semibold">
                    {completedSets}/{totalSets}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Exercícios finalizados: {completedExercises}/{exercises.length}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-muted-foreground">
                  Tudo certo! Toque em “Finalizar treino” para salvar o tempo total e voltar ao painel.
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
                <p className="text-muted-foreground">Nenhum exercício cadastrado neste treino.</p>
                <Button variant="outline" onClick={() => navigate(`/workout/${id}`)}>
                  Adicionar exercícios
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
              const isCurrentExercise = focusExerciseId === exercise.id;
              const restStatus =
                sessionStatus !== "in_progress"
                  ? "Aguardando início do treino"
                  : restActive
                    ? restRemaining === 0
                      ? "Descanso concluído"
                      : "Descanso em andamento"
                    : "Pronto para próxima série";
              const restCountdownLabel =
                sessionStatus === "in_progress" ? formatClock(restRemaining) : formatClock(restDuration);
              const setDetails = Array.from({ length: exercise.sets }, (_, index) => {
                const planEntry = exercise.set_plan[index];
                const repsValue =
                  typeof planEntry?.reps === "number" && Number.isFinite(planEntry.reps)
                    ? planEntry.reps
                    : exercise.reps;
                const weightValue =
                  typeof planEntry?.weight === "number" && Number.isFinite(planEntry.weight)
                    ? planEntry.weight
                    : resolveWeight(exercise);
                const status: "completed" | "active" | "pending" =
                  index < completed ? "completed" : isCurrentExercise && index === completed ? "active" : "pending";
                return {
                  index: index + 1,
                  reps: repsValue,
                  weight: weightValue,
                  status,
                };
              });

              return (
                <Card key={exercise.id} className="shadow-card border-border/60">
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{exercise.name}</CardTitle>
                      <CardDescription>
                        {exercise.sets} séries • {exercise.reps} repetições
                      </CardDescription>
                    </div>
                    <Badge variant={finished ? "secondary" : "outline"}>
                      {finished ? "Concluído" : `Série ${completed + 1} de ${exercise.sets}`}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 text-sm text-muted-foreground sm:grid-cols-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Repeat className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide">Séries x Reps</p>
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

                    <p className="text-xs text-muted-foreground">
                      Descanso planejado: {baseRest}s - ajustes disponiveis apenas na edicao do treino.
                    </p>

                    <Separator />

                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Séries detalhadas
                      </Label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {setDetails.map((detail) => (
                          <div
                            key={`${exercise.id}-set-${detail.index}`}
                            className={cn(
                              "rounded-lg border p-3 text-sm transition-colors",
                              detail.status === "completed" && "border-emerald-500/60 bg-emerald-500/10",
                              detail.status === "active" && "border-primary/60 bg-primary/10",
                              detail.status === "pending" && "border-border/60 bg-background/40",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-foreground">Série {detail.index}</span>
                              <span className="text-xs uppercase text-muted-foreground">
                                {detail.status === "completed"
                                  ? "Concluída"
                                  : detail.status === "active"
                                    ? "Em andamento"
                                    : "Planejada"}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {detail.reps} repetições • {detail.weight} kg
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ajuste o peso antes de concluir a série se alterar a carga em relação ao plano.
                      </p>
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
                        {finished ? "Exercício finalizado." : `Complete as séries para registrar o exercício.`}
                      </p>
                      <Button
                        onClick={() => handleCompleteSet(exercise.id)}
                        disabled={finished || saving[exercise.id]}
                        className="sm:w-auto"
                      >
                        {finished ? (
                          <span className="inline-flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            Concluído
                          </span>
                        ) : saving[exercise.id] ? (
                          "Registrando..."
                        ) : (
                          `Concluir série (${completed + 1}/${exercise.sets})`
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
      <AlertDialog open={exitPromptOpen} onOpenChange={(open) => !open && handleCancelNavigationExit()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você está no meio de um treino</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja sair agora? Seu progresso pode não ser salvo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelNavigationExit}>Continuar treino</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmNavigationExit}>Sair mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkoutSession;


