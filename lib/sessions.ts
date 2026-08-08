import { randomUUID } from "crypto";

const SESSION_COOKIE = "session_id";

// sessionId -> the set of thread_ids that session is allowed to read/resume.
// In-memory, same tradeoff as MemorySaver: resets on server restart, and is
// per-instance under multiple replicas. Fine for this learning project, not
// for a real multi-instance deployment.
const ownedThreads = new Map<string, Set<string>>();

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getOrCreateSessionId(req: Request): { sessionId: string; isNew: boolean } {
  const existing = parseCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (existing) return { sessionId: existing, isNew: false };
  return { sessionId: randomUUID(), isNew: true };
}

export function ownsThread(sessionId: string, threadId: string): boolean {
  return ownedThreads.get(sessionId)?.has(threadId) ?? false;
}

export function isThreadOwnedByAnyone(threadId: string): boolean {
  for (const threads of ownedThreads.values()) {
    if (threads.has(threadId)) return true;
  }
  return false;
}

export function registerThread(sessionId: string, threadId: string): void {
  if (!ownedThreads.has(sessionId)) ownedThreads.set(sessionId, new Set());
  ownedThreads.get(sessionId)!.add(threadId);
}

export function sessionCookieHeader(sessionId: string): string {
  const maxAgeSeconds = 60 * 60 * 24 * 7; // 7 days
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}
