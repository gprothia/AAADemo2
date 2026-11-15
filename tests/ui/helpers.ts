// Shared helpers for UI tests that set up data through the API directly.
// Use these instead of hard-coding the API URL or headers, so the same tests run locally,
// on GKE, and against UAT on Cloud Run (where the API is private and needs a token).
export const API = process.env.API_BASE_URL ?? 'http://localhost:8080';

export function apiHeaders(user = 'demo'): Record<string, string> {
  const headers: Record<string, string> = { 'X-User': user };
  if (process.env.API_AUTH_TOKEN) headers.Authorization = `Bearer ${process.env.API_AUTH_TOKEN}`;
  return headers;
}
