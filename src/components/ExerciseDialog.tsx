import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface ExerciseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workoutId: string;
  nextOrderIndex: number;
  exercise?: {
    id: string;
    name: string;
    sets: number;
    reps: number;
    weight: number;
    rest_seconds: number;
    order_index: number;
  } | null;
}

const ExerciseDialog = ({ open, onOpenChange, workoutId, nextOrderIndex, exercise }: ExerciseDialogProps) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("12");
  const [weight, setWeight] = useState("0");
  const [restSeconds, setRestSeconds] = useState("60");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (exercise) {
      setName(exercise.name);
      setSets(String(exercise.sets));
      setReps(String(exercise.reps));
      setWeight(String(exercise.weight));
      setRestSeconds(String(exercise.rest_seconds));
    } else {
      setName("");
      setSets("3");
      setReps("12");
      setWeight("0");
      setRestSeconds("60");
    }
  }, [exercise]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (exercise) {
        // Update
        const { error } = await supabase
          .from("exercises")
          .update({
            name,
            sets: parseInt(sets),
            reps: parseInt(reps),
            weight: parseFloat(weight),
            rest_seconds: parseInt(restSeconds),
          })
          .eq("id", exercise.id);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Exercício atualizado com sucesso",
        });
      } else {
        // Create
        const { error } = await supabase
          .from("exercises")
          .insert({
            workout_id: workoutId,
            name,
            sets: parseInt(sets),
            reps: parseInt(reps),
            weight: parseFloat(weight),
            rest_seconds: parseInt(restSeconds),
            order_index: nextOrderIndex,
          });

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Exercício criado com sucesso",
        });
      }

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {exercise ? "Editar Exercício" : "Novo Exercício"}
          </DialogTitle>
          <DialogDescription>
            {exercise ? "Atualize as informações do exercício" : "Adicione um novo exercício ao treino"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Exercício</Label>
            <Input
              id="name"
              placeholder="Ex: Supino Reto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sets">Séries</Label>
              <Input
                id="sets"
                type="number"
                min="1"
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reps">Repetições</Label>
              <Input
                id="reps"
                type="number"
                min="1"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="weight">Carga (kg)</Label>
              <Input
                id="weight"
                type="number"
                step="0.5"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rest">Descanso (s)</Label>
              <Input
                id="rest"
                type="number"
                min="0"
                step="15"
                value={restSeconds}
                onChange={(e) => setRestSeconds(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="gradient-primary"
              disabled={loading}
            >
              {loading ? "Salvando..." : exercise ? "Atualizar" : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ExerciseDialog;