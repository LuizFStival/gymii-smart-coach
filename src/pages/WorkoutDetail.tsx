import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ExerciseDialog from "@/components/ExerciseDialog";
import ExerciseCard from "@/components/ExerciseCard";
import { formatMuscleGroupLabel, muscleGroupsFromString } from "@/lib/training";

interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight: number;
  rest_seconds: number;
  order_index: number;
  set_plan?: unknown;
}

const WorkoutDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [workout, setWorkout] = useState<any>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      fetchWorkoutData();
    };
    checkAuth();
  }, [id, navigate]);

  const fetchWorkoutData = async () => {
    setLoading(true);
    
    const { data: workoutData, error: workoutError } = await supabase
      .from("workouts")
      .select("*")
      .eq("id", id)
      .single();

    if (workoutError) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar o treino",
        variant: "destructive",
      });
      navigate("/workouts");
      return;
    }

    setWorkout(workoutData);

    const { data: exercisesData, error: exercisesError } = await supabase
      .from("exercises")
      .select("*")
      .eq("workout_id", id)
      .order("order_index", { ascending: true });

    if (exercisesError) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar os exercícios",
        variant: "destructive",
      });
    } else {
      setExercises(exercisesData || []);
    }

    setLoading(false);
  };

  const handleEdit = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setDialogOpen(true);
  };

  const handleDelete = async (exerciseId: string) => {
    const { error } = await supabase
      .from("exercises")
      .delete()
      .eq("id", exerciseId);

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível excluir o exercício",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Sucesso",
        description: "Exercício excluído com sucesso",
      });
      fetchWorkoutData();
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingExercise(null);
    fetchWorkoutData();
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-dark flex items-center justify-center">
        <div className="text-primary animate-pulse">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-dark">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/workouts")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{workout?.name}</h1>
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
          <Button
            onClick={() => navigate(`/execute/${id}`)}
            className="gradient-secondary shadow-glow-secondary"
          >
            <Play className="w-4 h-4 mr-2" />
            Iniciar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            Exercícios ({exercises.length})
          </h2>
          <Button
            onClick={() => setDialogOpen(true)}
            className="gradient-primary shadow-glow-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Exercício
          </Button>
        </div>

        {exercises.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="py-16 text-center space-y-2">
              <p className="text-muted-foreground">
                Nenhum exercício cadastrado
              </p>
              <p className="text-sm text-muted-foreground">
                Adicione exercícios para começar seu treino
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {exercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      <ExerciseDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        workoutId={id!}
        exercise={editingExercise}
        nextOrderIndex={exercises.length}
      />
    </div>
  );
};

export default WorkoutDetail;
