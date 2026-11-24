// The one rule for "can this person get this program's FIRST email right now",
// shared by the Outreach tab (to disable rows and say why) and the generate
// route (to enforce it), so they can never disagree. A person can get both
// programs' emails, but each program's first email only once.

import { PROGRAMS, type ProgramKey } from './affiliatePrograms';
import type { Prospect } from '../types';

export function firstEmailBlocker(
  p: Pick<Prospect, 'disqualified' | 'unsubscribed' | 'email' | 'stage'>,
  program: ProgramKey,
  alreadySent: ProgramKey[]
): string | null {
  if (p.disqualified) return 'Disqualified';
  if (p.unsubscribed) return 'Unsubscribed';
  if (!p.email) return 'No email yet';
  if (alreadySent.includes(program)) return `${PROGRAMS[program].label} email already sent`;
  if (p.stage !== 'approved' && p.stage !== 'reached_out') return 'Already past the first email';
  return null;
}
