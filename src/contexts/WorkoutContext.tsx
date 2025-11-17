import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type SessionStatus = "idle" | "in_progress" | "completed";

type Snapshot = {
  status: SessionStatus;
  start: number | null;
  end: number | null;
};

interface WorkoutContextValue {
  status: SessionStatus;
  elapsedSeconds: number;
  startTimer: (startTimestamp?: number) => void;
  finishTimer: (endTimestamp?: number) => void;
  resetTimer: () => void;
  syncTimer: (payload: Snapshot) => void;
}

const WorkoutContext = createContext<WorkoutContextValue | undefined>(undefined);

const tickFrom = (start: number, setElapsedSeconds: (value: number) => void) => {
  const compute = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
  compute();
  return window.setInterval(compute, 1000);
};

export const WorkoutProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startRef = useRef<number | null>(null);
  const tickerRef = useRef<number | null>(null);
  const snapshotRef = useRef<Snapshot>({ status: "idle", start: null, end: null });

  const clearTicker = useCallback(() => {
    if (tickerRef.current !== null && typeof window !== "undefined") {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const applyIdle = useCallback(() => {
    clearTicker();
    setStatus("idle");
    setElapsedSeconds(0);
  }, [clearTicker]);

  const applyRunning = useCallback(
    (startTimestamp: number) => {
      if (typeof window === "undefined") {
        setElapsedSeconds(0);
        setStatus("in_progress");
        return;
      }
      clearTicker();
      setStatus("in_progress");
      tickerRef.current = tickFrom(startTimestamp, setElapsedSeconds);
    },
    [clearTicker],
  );

  const applyCompleted = useCallback(
    (startTimestamp: number, endTimestamp: number) => {
      clearTicker();
      setStatus("completed");
      setElapsedSeconds(Math.max(0, Math.floor((endTimestamp - startTimestamp) / 1000)));
    },
    [clearTicker],
  );

  const updateSnapshot = useCallback((next: Snapshot) => {
    snapshotRef.current = next;
  }, []);

  const startTimer = useCallback(
    (startTimestamp?: number) => {
      const startValue = startTimestamp ?? Date.now();
      startRef.current = startValue;
      updateSnapshot({ status: "in_progress", start: startValue, end: null });
      applyRunning(startValue);
    },
    [applyRunning, updateSnapshot],
  );

  const finishTimer = useCallback(
    (endTimestamp?: number) => {
      const startValue = startRef.current ?? Date.now();
      const endValue = endTimestamp ?? Date.now();
      startRef.current = startValue;
      updateSnapshot({ status: "completed", start: startValue, end: endValue });
      applyCompleted(startValue, endValue);
    },
    [applyCompleted, updateSnapshot],
  );

  const resetTimer = useCallback(() => {
    startRef.current = null;
    updateSnapshot({ status: "idle", start: null, end: null });
    applyIdle();
  }, [applyIdle, updateSnapshot]);

  const syncTimer = useCallback(
    (payload: Snapshot) => {
      const normalized: Snapshot =
        payload.status === "idle" || !payload.start
          ? { status: "idle", start: null, end: null }
          : payload.status === "in_progress"
            ? { status: "in_progress", start: payload.start, end: null }
            : {
                status: "completed",
                start: payload.start,
                end: payload.end ?? Date.now(),
              };

      const snapshot = snapshotRef.current;
      if (
        snapshot.status === normalized.status &&
        snapshot.start === normalized.start &&
        snapshot.end === normalized.end
      ) {
        return;
      }

      if (normalized.status === "idle" || normalized.start === null) {
        resetTimer();
        return;
      }

      if (normalized.status === "in_progress") {
        startTimer(normalized.start);
        return;
      }

      startRef.current = normalized.start;
      finishTimer(normalized.end ?? Date.now());
    },
    [finishTimer, resetTimer, startTimer],
  );

  useEffect(
    () => () => {
      clearTicker();
    },
    [clearTicker],
  );

  const value = useMemo<WorkoutContextValue>(
    () => ({
      status,
      elapsedSeconds,
      startTimer,
      finishTimer,
      resetTimer,
      syncTimer,
    }),
    [elapsedSeconds, resetTimer, startTimer, status, finishTimer, syncTimer],
  );

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
};

export const useWorkoutTimer = () => {
  const context = useContext(WorkoutContext);
  if (!context) {
    throw new Error("useWorkoutTimer must be used within a WorkoutProvider");
  }
  return context;
};
