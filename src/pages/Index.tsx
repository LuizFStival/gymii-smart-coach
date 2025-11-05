import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dumbbell, TrendingUp, Calendar, Zap } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/dashboard");
      }
    };
    checkAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen gradient-dark">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center space-y-8">
        <div className="flex justify-center mb-8">
          <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center shadow-glow-primary animate-fade-in">
            <Dumbbell className="w-12 h-12 text-primary-foreground" />
          </div>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold animate-fade-in">
          GYMii
        </h1>
        
        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto animate-fade-in">
          Seu assistente de treino inteligente que acompanha sua evolução e te ajuda a alcançar seus objetivos
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8 animate-fade-in">
          <Button
            onClick={() => navigate("/auth")}
            size="lg"
            className="text-lg px-8 py-6 gradient-primary shadow-glow-primary hover:opacity-90 transition-opacity"
          >
            Começar Agora
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          Recursos Inteligentes
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center space-y-4 p-6 rounded-lg bg-card/50 border border-border/50 shadow-card hover:border-primary/50 transition-colors">
            <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center shadow-glow-primary mx-auto">
              <Dumbbell className="w-8 h-8 text-primary-foreground" />
            </div>
            <h3 className="text-xl font-semibold">Treinos Personalizados</h3>
            <p className="text-muted-foreground">
              Crie e organize seus treinos do seu jeito
            </p>
          </div>

          <div className="text-center space-y-4 p-6 rounded-lg bg-card/50 border border-border/50 shadow-card hover:border-secondary/50 transition-colors">
            <div className="w-16 h-16 rounded-full gradient-secondary flex items-center justify-center shadow-glow-secondary mx-auto">
              <TrendingUp className="w-8 h-8 text-secondary-foreground" />
            </div>
            <h3 className="text-xl font-semibold">Acompanhe sua Evolução</h3>
            <p className="text-muted-foreground">
              Veja seu progresso com gráficos e estatísticas
            </p>
          </div>

          <div className="text-center space-y-4 p-6 rounded-lg bg-card/50 border border-border/50 shadow-card hover:border-accent/50 transition-colors">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto">
              <Zap className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-xl font-semibold">Notificações Inteligentes</h3>
            <p className="text-muted-foreground">
              Receba alertas sobre estagnação e progresso
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-3xl mx-auto space-y-6 p-8 rounded-2xl bg-card/50 border border-border/50 shadow-card">
          <h2 className="text-3xl md:text-4xl font-bold">
            Pronto para evoluir?
          </h2>
          <p className="text-lg text-muted-foreground">
            Comece gratuitamente e transforme seus treinos hoje mesmo
          </p>
          <Button
            onClick={() => navigate("/auth")}
            size="lg"
            className="text-lg px-8 py-6 gradient-primary shadow-glow-primary hover:opacity-90 transition-opacity"
          >
            Criar Conta Grátis
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Index;
