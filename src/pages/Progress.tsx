import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays, subWeeks, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { muscleGroupsFromString, formatMuscleGroupLabel } from "@/lib/training";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarCheck2,
  Dumbbell,
  Flame,
} from "lucide-react";

type WorkoutLogWithExercise = Tables<"workout_logs"> & {
  exercises: {
    name: string;
    workouts: {
      name: string;
      muscle_group: string;
    } | null;
  } | null;
};

type EnrichedLog = WorkoutLogWithExercise & {
  completedAt: Date;
  sets: number;
  reps: number;
  weight: number;
  volume: number;
  exerciseName: string;
  muscles: string[];
  sessionKey: string;
};

const SUMMARY_DAYS = 30;
const DATA_WINDOW_DAYS = 90;
const WEEKS_TO_SHOW = 6;

const volumeFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

const percentageFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

const Progress = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<WorkoutLogWithExercise[]>([]);

  useEffect(() => {
    const fetchProgressData = async () => {
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          navigate("/auth");
          return;
        }

        const since = subDays(new Date(), DATA_WINDOW_DAYS).toISOString();

        const { data, error } = await supabase
          .from("workout_logs")
          .select(
            "id, exercise_id, reps, sets, weight, completed_at, exercises(name, workouts(name, muscle_group))",
          )
          .eq("user_id", session.user.id)
          .gte("completed_at", since)
          .order("completed_at", { ascending: true });

        if (error) throw error;

        setLogs((data as WorkoutLogWithExercise[]) ?? []);
      } catch (error) {
        console.error(error);
        const message =
          error instanceof Error ? error.message : "Tente novamente em instantes.";
        toast({
          title: "Erro ao carregar progresso",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProgressData();
  }, [navigate, toast]);

  const stats = useMemo(() => {
    const enrichedLogs: EnrichedLog[] = logs
      .map((log) => {
        if (!log.completed_at) return null;
        const completedAt = new Date(log.completed_at);
        if (Number.isNaN(completedAt.getTime())) return null;

        const sets = Number(log.sets) || 0;
        const reps = Number(log.reps) || 0;
        const weight = Number(log.weight) || 0;
        const volume = Math.max(sets * reps * weight, 0);
        const exerciseName = (log.exercises?.name ?? "Exercício").trim() || "Exercício";
        const musclesRaw = muscleGroupsFromString(log.exercises?.workouts?.muscle_group);
        const muscles = (musclesRaw.length ? musclesRaw : ["Geral"]).map(formatMuscleGroupLabel);
        const sessionKey = format(completedAt, "yyyy-MM-dd");

        return {
          ...log,
          completedAt,
          sets,
          reps,
          weight,
          volume,
          exerciseName,
          muscles,
          sessionKey,
        };
      })
      .filter((log): log is EnrichedLog => Boolean(log));

    const now = new Date();
    const summaryStart = subDays(now, SUMMARY_DAYS);
    const summaryLogs = enrichedLogs.filter((log) => log.completedAt >= summaryStart);
    const summarySessions = new Set(summaryLogs.map((log) => log.sessionKey));

    const totalVolume = summaryLogs.reduce((sum, log) => sum + log.volume, 0);
    const totalSets = summaryLogs.reduce((sum, log) => sum + log.sets, 0);
    const totalSessions = summarySessions.size;

    const globalVolume = enrichedLogs.reduce((sum, log) => sum + log.volume, 0);

    const exerciseStats = new Map<
      string,
      {
        volume: number;
        sessions: Set<string>;
      }
    >();

    const muscleStats = new Map<string, number>();
    const sessionStats = new Map<
      string,
      {
        date: Date;
        volume: number;
        exercises: Set<string>;
      }
    >();

    enrichedLogs.forEach((log) => {
      const currentExercise = exerciseStats.get(log.exerciseName) ?? {
        volume: 0,
        sessions: new Set<string>(),
      };
      currentExercise.volume += log.volume;
      currentExercise.sessions.add(log.sessionKey);
      exerciseStats.set(log.exerciseName, currentExercise);

      log.muscles.forEach((muscle) => {
        muscleStats.set(muscle, (muscleStats.get(muscle) ?? 0) + log.volume);
      });

      const sessionInfo = sessionStats.get(log.sessionKey) ?? {
        date: log.completedAt,
        volume: 0,
        exercises: new Set<string>(),
      };
      sessionInfo.volume += log.volume;
      sessionInfo.exercises.add(log.exerciseName);
      sessionStats.set(log.sessionKey, sessionInfo);
    });

    const weeklyTrend = Array.from({ length: WEEKS_TO_SHOW }).map((_, index) => {
      const weekStart = startOfWeek(subWeeks(now, WEEKS_TO_SHOW - 1 - index), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekVolume = enrichedLogs
        .filter((log) => isWithinInterval(log.completedAt, { start: weekStart, end: weekEnd }))
        .reduce((sum, log) => sum + log.volume, 0);

      return {
        label: format(weekStart, "dd/MM"),
        volume: Math.round(weekVolume),
      };
    });

    const muscleDistribution = Array.from(muscleStats.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([muscle, volume]) => ({
        muscle,
        volume,
        percentage: globalVolume > 0 ? (volume / globalVolume) * 100 : 0,
      }));

    const topExercises = Array.from(exerciseStats.entries())
      .map(([name, info]) => ({
        name,
        volume: info.volume,
        percentage: globalVolume > 0 ? (info.volume / globalVolume) * 100 : 0,
        sessions: info.sessions.size,
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 4);

    const recentSessions = Array.from(sessionStats.values())
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 4)
      .map((session) => ({
        dateLabel: format(session.date, "dd/MM"),
        volumeLabel: `${volumeFormatter.format(session.volume)} kg`,
        exercises: Array.from(session.exercises).slice(0, 3),
      }));

    return {
      hasLogs: enrichedLogs.length > 0,
      summary: {
        totalVolume,
        totalSets,
        totalSessions,
      },
      weeklyTrend,
      muscleDistribution,
      topExercises,
      recentSessions,
    };
  }, [logs]);

  if (loading) {
    return (
      <div className="min-h-screen gradient-dark flex items-center justify-center">
        <div className="text-primary animate-pulse">Carregando progresso...</div>
      </div>
    );
  }

  const summaryCards = [
    {
      title: "Sessões concluídas",
      value: numberFormatter.format(stats.summary.totalSessions),
      description: `Últimos ${SUMMARY_DAYS} dias`,
      icon: CalendarCheck2,
    },
    {
      title: "Volume total",
      value: `${volumeFormatter.format(stats.summary.totalVolume)} kg`,
      description: "Carga movimentada",
      icon: Dumbbell,
    },
    {
      title: "Séries executadas",
      value: numberFormatter.format(stats.summary.totalSets),
      description: `Últimos ${SUMMARY_DAYS} dias`,
      icon: Activity,
    },
  ];

  return (
    <div className="min-h-screen gradient-dark">
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto flex flex-wrap items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Progresso</h1>
            <p className="text-sm text-muted-foreground">
              Acompanhe como seus treinos evoluíram nas últimas semanas.
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {stats.hasLogs ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {summaryCards.map((card) => (
                <Card key={card.title} className="shadow-card border-border/60 bg-card/80 backdrop-blur">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                    <card.icon className="h-4 w-4 text-secondary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{card.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                  </CardContent>
                </Card>
              ))}
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-card border-border/60 bg-card/80 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-secondary" />
                    Volume semanal
                  </CardTitle>
                  <CardDescription>Comparativo das últimas {WEEKS_TO_SHOW} semanas</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      volume: {
                        label: "Volume (kg)",
                        color: "hsl(var(--primary))",
                      },
                    }}
                    className="h-[260px]"
                  >
                    <BarChart data={stats.weeklyTrend} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                      <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                      <Bar dataKey="volume" fill="var(--color-volume)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card className="shadow-card border-border/60 bg-card/80 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-secondary" />
                    Grupos mais trabalhados
                  </CardTitle>
                  <CardDescription>Distribuição de volume por grupo muscular</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {stats.muscleDistribution.length === 0 && (
                    <p className="text-sm text-muted-foreground">Ainda não há volume registrado para análise.</p>
                  )}
                  {stats.muscleDistribution.map((item) => (
                    <div key={item.muscle} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{item.muscle}</span>
                        <span className="text-muted-foreground">
                          {percentageFormatter.format(item.percentage)}%
                        </span>
                      </div>
                      <ProgressBar value={item.percentage} className="h-2 bg-muted" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <Card className="shadow-card border-border/60 bg-card/80 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Dumbbell className="w-5 h-5 text-secondary" />
                    Exercícios em destaque
                  </CardTitle>
                  <CardDescription>Onde você concentrou mais esforço recentemente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {stats.topExercises.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Complete algumas sessões para visualizar os exercícios em destaque.
                    </p>
                  )}
                  {stats.topExercises.map((exercise) => (
                    <div key={exercise.name} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{exercise.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {exercise.sessions} sessão{exercise.sessions === 1 ? "" : "es"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{`${volumeFormatter.format(exercise.volume)} kg`}</p>
                        <p className="text-xs text-muted-foreground">
                          {percentageFormatter.format(exercise.percentage)}% do volume
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="shadow-card border-border/60 bg-card/80 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarCheck2 className="w-5 h-5 text-secondary" />
                    Últimas sessões
                  </CardTitle>
                  <CardDescription>Resumo rápido do que foi trabalhado recentemente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {stats.recentSessions.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Complete um treino registrando os exercícios para destravar este histórico.
                    </p>
                  )}
                  {stats.recentSessions.map((session, index) => (
                    <div key={`${session.dateLabel}-${index}`} className="border border-border/50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{session.dateLabel}</span>
                        <span className="text-sm text-muted-foreground">{session.volumeLabel}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {session.exercises.join(", ")}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          </>
        ) : (
          <Card className="shadow-card border-border/60 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle>Nenhum progresso registrado</CardTitle>
              <CardDescription>
                Assim que você finalizar um treino no modo sessão, seus avanços aparecerão automaticamente aqui.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Utilize o modo sessão para registrar séries, repetições e cargas — isso desbloqueia estatísticas,
                  gráficos e insights semanais.
                </p>
              </div>
              <Button onClick={() => navigate("/workouts")} className="gradient-primary text-primary-foreground">
                Começar um treino
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Progress;
