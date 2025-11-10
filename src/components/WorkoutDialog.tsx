import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/hooks/use-toast";
import { formatMuscleGroupLabel, muscleGroupsFromString, stringifyMuscleGroups } from "@/lib/training";
import { cn } from "@/lib/utils";

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
  "Biceps",
  "Triceps",
  "Abdomen",
  "Core",
  "Corpo Inteiro",
  "Aerobico",
];

const WorkoutDialog = ({ open, onOpenChange, workout }: WorkoutDialogProps) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (workout) {
      setName(workout.name);
      setSelectedGroups(muscleGroupsFromString(workout.muscle_group));
    } else {
      setName("");
      setSelectedGroups([]);
    }
  }, [workout]);

  const toggleGroup = (group: string) => {
    setSelectedGroups((previous) => {
      if (previous.includes(group)) {
        return previous.filter((item) => item !== group);
      }
      return [...previous, group];
    });
  };

  const selectedGroupsLabel = useMemo(() => {
    if (selectedGroups.length === 0) {
      return "Nenhum grupo selecionado";
    }
    return selectedGroups.map(formatMuscleGroupLabel).join(", ");
  }, [selectedGroups]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedGroups.length === 0) {
      toast({
        title: "Selecione ao menos um grupo",
        description: "Escolha uma ou mais areas para organizar o treino.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Nao autenticado");

      const muscleGroupValue = stringifyMuscleGroups(selectedGroups);

      if (workout) {
        const { error } = await supabase
          .from("workouts")
          .update({ name, muscle_group: muscleGroupValue })
          .eq("id", workout.id);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Treino atualizado com sucesso",
        });
      } else {
        const { error } = await supabase.from("workouts").insert({
          name,
          muscle_group: muscleGroupValue,
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
          <DialogTitle>{workout ? "Editar treino" : "Novo treino"}</DialogTitle>
          <DialogDescription>
            {workout ? "Atualize as informacoes do treino" : "Crie um novo treino personalizado"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do treino</Label>
            <Input
              id="name"
              placeholder="Ex: Treino 2 (Aerobico, Pernas)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Grupos musculares</Label>
            <p className="text-xs text-muted-foreground">{selectedGroupsLabel}</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {muscleGroups.map((group) => {
                const active = selectedGroups.includes(group);
                return (
                  <Toggle
                    key={group}
                    pressed={active}
                    onPressedChange={() => toggleGroup(group)}
                    className={cn(
                      "justify-start text-sm",
                      active ? "gradient-primary text-primary-foreground shadow-glow-primary" : "border-border",
                    )}
                  >
                    {formatMuscleGroupLabel(group)}
                  </Toggle>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="gradient-primary" disabled={loading}>
              {loading ? "Salvando..." : workout ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutDialog;
