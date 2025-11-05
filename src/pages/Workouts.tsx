import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Dumbbell, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import WorkoutDialog from "@/components/WorkoutDialog";

interface Workout {
  id: string;
  name: string;
  muscle_group: string;
  created_at: string;
}

const Workouts = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      fetchWorkouts();
    };
    checkAuth();
  }, [navigate]);

  const fetchWorkouts = async () => {
    setLoading(true);
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
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("workouts")
      .delete()
      .eq("id", id);

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

  if (loading) {
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold">Meus Treinos</h1>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="gradient-primary shadow-glow-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Treino
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {workouts.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <Dumbbell className="w-16 h-16 text-muted-foreground mx-auto" />
            <h3 className="text-xl font-semibold text-muted-foreground">
              Nenhum treino cadastrado
            </h3>
            <p className="text-sm text-muted-foreground">
              Crie seu primeiro treino para começar
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workouts.map((workout) => (
              <Card key={workout.id} className="shadow-card border-border/50 hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="truncate">{workout.name}</span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(workout)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(workout.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Dumbbell className="w-4 h-4" />
                    <span>{workout.muscle_group}</span>
                  </div>
                  <Button
                    onClick={() => navigate(`/workout/${workout.id}`)}
                    className="w-full"
                    variant="outline"
                  >
                    Ver Detalhes
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <WorkoutDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        workout={editingWorkout}
      />
    </div>
  );
};

export default Workouts;