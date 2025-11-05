import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Weight, Repeat, Timer } from "lucide-react";

interface ExerciseCardProps {
  exercise: {
    id: string;
    name: string;
    sets: number;
    reps: number;
    weight: number;
    rest_seconds: number;
  };
  onEdit: (exercise: any) => void;
  onDelete: (id: string) => void;
}

const ExerciseCard = ({ exercise, onEdit, onDelete }: ExerciseCardProps) => {
  return (
    <Card className="shadow-card border-border/50 hover:border-primary/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lg">{exercise.name}</h3>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(exercise)}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(exercise.id)}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Repeat className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Séries x Reps</p>
              <p className="font-semibold">{exercise.sets} x {exercise.reps}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
              <Weight className="w-4 h-4 text-secondary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Carga</p>
              <p className="font-semibold">{exercise.weight} kg</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Timer className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Descanso</p>
              <p className="font-semibold">{exercise.rest_seconds}s</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExerciseCard;