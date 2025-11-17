import type { SessionStatus } from "@/contexts/WorkoutContext";

export const SESSION_STORAGE_PREFIX = "gymii-active-session";
export const SESSION_STORAGE_VERSION = 1;

export type PersistedSessionMetadata = {
  version: number;
  userId: string;
  workoutId: string;
  workoutName: string | null;
  sessionStatus: SessionStatus;
  sessionStart: number | null;
  sessionEnd: number | null;
  lastUpdated: number;
};

export type StoredSessionEntry = {
  key: string;
  metadata: PersistedSessionMetadata;
};

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const parseMetadata = (value: string): PersistedSessionMetadata | null => {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const version = typeof parsed.version === "number" ? parsed.version : null;
    if (version !== SESSION_STORAGE_VERSION) {
      return null;
    }

    const workoutId = typeof parsed.workoutId === "string" ? parsed.workoutId : null;
    const userId = typeof parsed.userId === "string" ? parsed.userId : null;
    if (!workoutId || !userId) {
      return null;
    }

    const status = parsed.sessionStatus;
    const sessionStatus: SessionStatus =
      status === "in_progress" || status === "completed" ? status : "idle";

    const sessionStart = typeof parsed.sessionStart === "number" ? parsed.sessionStart : null;
    const sessionEnd = typeof parsed.sessionEnd === "number" ? parsed.sessionEnd : null;
    const lastUpdatedRaw = typeof parsed.lastUpdated === "number" ? parsed.lastUpdated : sessionStart;
    const lastUpdated = typeof lastUpdatedRaw === "number" ? lastUpdatedRaw : Date.now();
    const workoutName = typeof parsed.workoutName === "string" ? parsed.workoutName : null;

    return {
      version,
      userId,
      workoutId,
      workoutName,
      sessionStatus,
      sessionStart,
      sessionEnd,
      lastUpdated,
    };
  } catch (error) {
    console.warn("Failed to parse persisted session", error);
    return null;
  }
};

export const readStoredSessions = (): StoredSessionEntry[] => {
  if (!isBrowser()) {
    return [];
  }

  const entries: StoredSessionEntry[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(SESSION_STORAGE_PREFIX)) {
      continue;
    }
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      continue;
    }
    const metadata = parseMetadata(raw);
    if (!metadata) {
      continue;
    }
    entries.push({ key, metadata });
  }
  return entries;
};

export const findLatestActiveSession = (
  userId: string,
  maxAgeMs = 1000 * 60 * 60 * 12,
): StoredSessionEntry | null => {
  if (!userId) {
    return null;
  }
  const now = Date.now();
  const sessions = readStoredSessions()
    .filter((entry) => entry.metadata.userId === userId)
    .filter((entry) => entry.metadata.sessionStatus === "in_progress")
    .filter((entry) => now - entry.metadata.lastUpdated <= maxAgeMs)
    .sort((a, b) => b.metadata.lastUpdated - a.metadata.lastUpdated);
  return sessions[0] ?? null;
};

export const clearStoredSession = (key: string) => {
  if (!isBrowser() || !key) {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("Failed to clear stored session", error);
  }
};
