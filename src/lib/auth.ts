import type { User } from '@supabase/supabase-js';

export function isAnonymousUser(user: User | null | undefined) {
  if (!user) return false;
  return Boolean((user as any).is_anonymous || user.app_metadata?.provider === 'anonymous');
}
