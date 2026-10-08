import { env } from 'cloudflare:workers';
import type { Pick } from './portal';
export const db = () => env.DB;
export const pickColumns = 'id, season, week, member, sport, selection, odds, status, created_at AS createdAt, updated_at AS updatedAt, revision, details, evidence';
export function decode(row: Record<string, unknown>) {
  return {...row, details: JSON.parse(String(row.details || '{}')), evidence: JSON.parse(String(row.evidence || '{}'))} as Pick;
}
export function safeWrite(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}
