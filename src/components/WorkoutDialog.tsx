import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface WorkoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout?: {
    id: string;
    name: string;
    muscle_group: string;
  } | null;
}

const muscleGroups = [
  "Peito",
  "Costas",
  "Pernas",
  "Ombros",
  "Bíceps",
  "Tríceps",
  "Abdômen",
  "Corpo Inteiro",
];

const WorkoutDialog = ({ open, onOpenChange, workout }: WorkoutDialogProps) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (workout) {
      setName(workout.name);
      setMuscleGroup(workout.muscle_group);
    } else {
      setName("");
      setMuscleGroup("");
    }
  }, [workout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      if (workout) {
        // Update
        const { error } = await supabase
          .from("workouts")
          .update({ name, muscle_group: muscleGroup })
          .eq("id", workout.id);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Treino atualizado com sucesso",
        });
      } else {
        // Create
        const { error } = await supabase
          .from("workouts")
          .insert({
            name,
            muscle_group: muscleGroup,
            user_id: session.user.id,
          });

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Treino criado com sucesso",
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {workout ? "Editar Treino" : "Novo Treino"}
          </DialogTitle>
          <DialogDescription>
            {workout ? "Atualize as informações do treino" : "Crie um novo treino personalizado"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Treino</Label>
            <Input
              id="name"
              placeholder="Ex: Treino A - Peito e Tríceps"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="muscleGroup">Grupo Muscular</Label>
            <Select value={muscleGroup} onValueChange={setMuscleGroup} required>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o grupo muscular" />
              </SelectTrigger>
              <SelectContent>
                {muscleGroups.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {loading ? "Salvando..." : workout ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutDialog;