import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { findLatestActiveSession } from "@/lib/workoutSessionStorage";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [resumeWorkoutId, setResumeWorkoutId] = useState<string | null>(null);
  const [resumeWorkoutName, setResumeWorkoutName] = useState<string | null>(null);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    const detectActiveSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId || !active) {
          return;
        }
        const entry = findLatestActiveSession(userId);
        if (entry && active) {
          setResumeWorkoutId(entry.metadata.workoutId);
          setResumeWorkoutName(entry.metadata.workoutName);
        }
      } catch (error) {
        console.warn("Failed to check active session on 404 page", error);
      }
    };
    void detectActiveSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!resumeWorkoutId) {
      return;
    }
    const timer = window.setTimeout(() => {
      navigate(`/execute/${resumeWorkoutId}`, { replace: true });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [navigate, resumeWorkoutId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="text-center space-y-4 rounded-xl bg-white/80 p-8 shadow-lg">
        <h1 className="text-4xl font-bold text-gray-900">404</h1>
        <p className="text-xl text-gray-600">Oops! Page not found</p>
        {resumeWorkoutId ? (
          <div className="space-y-3 text-sm text-gray-600">
            <p>Detectamos um treino em andamento.</p>
            <p className="font-semibold text-gray-900">
              {resumeWorkoutName ?? "Treino em andamento"}
            </p>
            <button
              className="w-full rounded-md bg-gray-900 px-4 py-2 font-medium text-white transition hover:bg-gray-800"
              onClick={() => navigate(`/execute/${resumeWorkoutId}`, { replace: true })}
            >
              Voltar para o treino agora
            </button>
            <p className="text-xs text-gray-500">Redirecionando automaticamente...</p>
          </div>
        ) : (
          <a href="/" className="text-blue-500 underline hover:text-blue-700">
            Return to Home
          </a>
        )}
      </div>
    </div>
  );
};

export default NotFound;
