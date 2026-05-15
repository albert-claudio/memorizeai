import type { RunObjective } from '@/lib/types';
import type { StudyGoalProfile } from '@/lib/study-goal-profiles';
import { Icons } from './components/Icons';

export type ObjectiveOption = {
  id: RunObjective;
  title: string;
  description: string;
  icon: React.ReactNode;
  model: string;
  color: string;
};

/**
 * Returns objective options adapted to the user's study goal.
 * Filters by profile.allowedObjectives and uses profile labels.
 */
export function getObjectives(profile: StudyGoalProfile | null): ObjectiveOption[] {
  const all: ObjectiveOption[] = [
    {
      id: 'questoes_banca',
      title: profile?.questionObjectiveLabel ?? 'Simulado de Banca',
      description: profile?.questionObjectiveDescription ?? 'Treino de prova no estilo FCC, CESPE e FGV, com pegadinhas reais',
      icon: <Icons.BookOpen />,
      model: 'Gemini 2.5 Flash',
      color: '#6366F1',
    },
    {
      id: 'flashcards',
      title: 'Flashcards de revisao',
      description: 'Cards para fixar os pontos que sustentam seu treino de prova',
      icon: <Icons.Zap />,
      model: 'Groq (Llama 3)',
      color: '#22C55E',
    },
    {
      id: 'exercicios_aplicados',
      title: profile?.logicObjectiveLabel || 'Exercicios Aplicados',
      description: profile?.logicObjectiveDescription || 'Exercicios de comparacao, analise e aplicacao',
      icon: <Icons.Scale />,
      model: 'Gemini 2.5 Flash',
      color: '#F59E0B',
    },
  ];

  if (!profile) return all;

  return all.filter(obj => profile.allowedObjectives.includes(obj.id));
}
