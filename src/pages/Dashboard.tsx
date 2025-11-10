import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, TrendingUp, Calendar, LogOut, Plus, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatMuscleGroupLabel, muscleGroupsFromString } from "@/lib/training";

type DashboardWorkout = {
  id: string;
  name: string;
  muscle_group: string;
  created_at: string;
  exercisesCount: number;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [workoutsCount, setWorkoutsCount] = useState(0);
  const [upcomingWorkouts, setUpcomingWorkouts] = useState<DashboardWorkout[]>([]);
  const [loading, setLoading] = useState(true);

  const renderMuscleBadges = useCallback((value: string) => {
    const groups = muscleGroupsFromString(value);
    if (groups.length === 0) {
      return <Badge variant="outline">Não definido</Badge>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {groups.map((group) => (
          <Badge key={group} variant="outline">
            {formatMuscleGroupLabel(group)}
          </Badge>
        ))}
      </div>
    );
  }, []);

  const formatDate = (value: string) => {
    try {
      return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value));
    } catch {
      return "--";
    }
  };

  const fetchDashboardData = useCallback(
    async (userId: string) => {
      const { data: workoutsData, error: workoutsError } = await supabase
        .from("workouts")
        .select("id, name, muscle_group, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (workoutsError) {
        toast({
          title: "Erro ao carregar treinos",
          description: "Não foi possível carregar seus treinos. Tente novamente mais tarde.",
          variant: "destructive",
        });
        setWorkoutsCount(0);
        setUpcomingWorkouts([]);
        return;
      }

      const sanitizedWorkouts = workoutsData ?? [];
      setWorkoutsCount(sanitizedWorkouts.length);

      if (sanitizedWorkouts.length === 0) {
        setUpcomingWorkouts([]);
        return;
      }

      const workoutIds = sanitizedWorkouts.map((workout) => workout.id);
      let counts: Record<string, number> = {};

      if (workoutIds.length > 0) {
        const { data: exercisesData, error: exercisesError } = await supabase
          .from("exercises")
          .select("workout_id")
          .in("workout_id", workoutIds);

        if (exercisesError) {
          toast({
            title: "Aviso",
            description: "Não foi possível contar os exercícios. Os próximos treinos serão exibidos mesmo assim.",
          });
        } else if (exercisesData) {
          counts = exercisesData.reduce<Record<string, number>>((acc, exercise) => {
            if (!exercise?.workout_id) {
              return acc;
            }
            acc[exercise.workout_id] = (acc[exercise.workout_id] || 0) + 1;
            return acc;
          }, {});
        }
      }

      const enhanced = sanitizedWorkouts.map((workout) => ({
        id: workout.id,
        name: workout.name,
        muscle_group: workout.muscle_group,
        created_at: workout.created_at,
        exercisesCount: counts[workout.id] ?? 0,
      }));

      setUpcomingWorkouts(enhanced);
    },
    [toast],
  );

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          navigate("/auth");
          return;
        }
        setUser(session.user);
        await fetchDashboardData(session.user.id);
      } catch (error) {
        toast({
          title: "Erro inesperado",
          description: "Não foi possível carregar o dashboard. Tente novamente.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        void fetchDashboardData(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchDashboardData, navigate, toast]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logout realizado",
      description: "Até logo!",
    });
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-dark flex items-center justify-center">
        <div className="text-center">
          <Dumbbell className="w-12 h-12 text-primary animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  const upcomingList = upcomingWorkouts.slice(0, 4);

  return (
    <div className="min-h-screen gradient-dark">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center shadow-glow-primary">
              <Dumbbell className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">GYMii</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/profile")}
            >
              <User className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Welcome Section */}
        <div className="space-y-2">
          <h2 className="text-3xl font-bold">
            Olá, {user?.user_metadata?.full_name || "Atleta"}! 💪
          </h2>
          <p className="text-muted-foreground">Pronto para treinar hoje?</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="shadow-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Treinos Criados</CardTitle>
              <Dumbbell className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{workoutsCount}</div>
            </CardContent>
          </Card>

          <Card className="shadow-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Progresso</CardTitle>
              <TrendingUp className="w-4 h-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">+0%</div>
              <p className="text-xs text-muted-foreground mt-1">Esta semana</p>
            </CardContent>
          </Card>

          <Card className="shadow-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Frequência</CardTitle>
              <Calendar className="w-4 h-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0x</div>
              <p className="text-xs text-muted-foreground mt-1">Esta semana</p>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Workouts */}
        <Card className="shadow-card border-border/50">
          <CardHeader className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg font-semibold">Próximos treinos</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/workouts")}
              >
                Gerenciar
              </Button>
            </div>
            <CardDescription>Veja a sequência sugerida e inicie um treino em poucos cliques.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {upcomingList.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Dumbbell className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Cadastre seu primeiro treino para montar sua sequência.</p>
                <Button
                  onClick={() => navigate("/workouts")}
                  className="gradient-primary shadow-glow-primary hover:opacity-90 transition-opacity"
                >
                  Criar treino
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {upcomingList.map((workout, index) => {
                  const isNext = index === 0;
                  const isLast = index === upcomingList.length - 1;
                  const dateLabel = formatDate(workout.created_at);
                  const exercisesLabel = `${workout.exercisesCount} ${workout.exercisesCount === 1 ? "exercício" : "exercícios"}`;

                  return (
                    <div key={workout.id} className="relative pl-10">
                      <div className="absolute left-0 top-0 flex h-full flex-col items-center">
                        <div
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                            isNext
                              ? "gradient-primary text-primary-foreground shadow-glow-primary"
                              : "bg-secondary/40 text-secondary-foreground",
                          )}
                        >
                          {index + 1}
                        </div>
                        {!isLast && <div className="mt-2 h-full w-px bg-border/60" />}
                      </div>

                      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/40 p-4 shadow-card md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{dateLabel}</p>
                          <h4 className="text-lg font-semibold">{workout.name}</h4>
                          <div className="mt-1">{renderMuscleBadges(workout.muscle_group)}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{exercisesLabel}</Badge>
                          {isNext && <Badge variant="secondary">Próximo</Badge>}
                          <Button
                            size="sm"
                            className={cn(
                              "hover:opacity-90 transition-opacity",
                              isNext ? "gradient-secondary shadow-glow-secondary" : "",
                            )}
                            onClick={() => navigate(`/execute/${workout.id}`)}
                          >
                            Iniciar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/workout/${workout.id}`)}
                          >
                            Detalhes
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Ações rápidas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={() => navigate("/workouts")}
              className="h-24 text-lg gradient-primary shadow-glow-primary hover:opacity-90 transition-opacity"
            >
              <Plus className="w-6 h-6 mr-2" />
              Meus Treinos
            </Button>
            <Button
              onClick={() => navigate("/progress")}
              variant="outline"
              className="h-24 text-lg border-2 border-secondary text-secondary hover:bg-secondary/10"
            >
              <TrendingUp className="w-6 h-6 mr-2" />
              Ver Progresso
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
