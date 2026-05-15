import { createClient } from '@/lib/supabase/server';
import { type StudyGoal } from '@/lib/study-goal-profiles';

/**
 * Fetch the authenticated user's study_goal from user_preferences.
 * Returns 'concurso' as the default if no row exists or user is not authenticated.
 *
 * For server-side use only (server actions, API routes).
 */
export async function getStudyGoal(): Promise<StudyGoal> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.warn('[getStudyGoal] No authenticated user — using concurso fallback (onboarding pendente)');
      return 'concurso';
    }

    const { data } = await supabase
      .from('user_preferences')
      .select('study_goal')
      .eq('user_id', user.id)
      .single();

    if (data?.study_goal) {
      return data.study_goal as StudyGoal;
    }

    return 'concurso';
  } catch {
    console.warn('[getStudyGoal] Error fetching study_goal — using concurso fallback');
    return 'concurso';
  }
}

/**
 * Fetch study goal using a service-role Supabase client (for API routes
 * that already have the userId and a service client).
 */
export async function getStudyGoalByUserId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<StudyGoal> {
  try {
    const { data } = await supabase
      .from('user_preferences')
      .select('study_goal')
      .eq('user_id', userId)
      .single();

    if (data?.study_goal) {
      return data.study_goal as StudyGoal;
    }

    return 'concurso';
  } catch {
    console.warn(`[getStudyGoalByUserId] Error fetching study_goal for ${userId} — using concurso fallback`);
    return 'concurso';
  }
}
