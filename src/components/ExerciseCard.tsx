import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Weight, Repeat, Timer } from "lucide-react";
import { parseSetPlan } from "@/lib/training";

type ExerciseCardExercise = {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight: number;
  rest_seconds: number;
  set_plan?: unknown;
};

interface ExerciseCardProps {
  exercise: ExerciseCardExercise;
  onEdit: (exercise: ExerciseCardExercise) => void;
  onDelete: (id: string) => void;
}

const ExerciseCard = ({ exercise, onEdit, onDelete }: ExerciseCardProps) => {
  const setPlan = parseSetPlan(exercise.set_plan);

  return (
    <Card className="shadow-card border-border/50 hover:border-primary/30 transition-colors">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">{exercise.name}</h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={() => onEdit(exercise)}>
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(exercise.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Repeat className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Séries x Reps</p>
              <p className="font-semibold">
                {exercise.sets} x {exercise.reps}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
              <Weight className="w-4 h-4 text-secondary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Carga</p>
              <p className="font-semibold">{exercise.weight} kg</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Timer className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Descanso</p>
              <p className="font-semibold">{exercise.rest_seconds}s</p>
            </div>
          </div>
        </div>

        {setPlan.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-card/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano de séries</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {setPlan.map((set) => (
                <div key={set.set} className="rounded-md border border-border/40 bg-background/50 p-2">
                  <Badge variant="outline">Set {set.set}</Badge>
                  <p className="mt-1 text-sm font-semibold">
                    {set.reps ?? "--"} reps · {set.weight ?? "--"} kg
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExerciseCard;
