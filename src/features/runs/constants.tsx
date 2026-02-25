
import type { RunObjective } from '@/lib/types';
import { Icons } from './components/Icons';

export type ObjectiveOption = {
  id: RunObjective;
  title: string;
  description: string;
  icon: React.ReactNode;
  model: string;
  color: string;
};

export const OBJECTIVES: ObjectiveOption[] = [
  {
    id: 'flashcards',
    title: 'Flashcards',
    description: 'Gera flashcards rápidos para memorização de conceitos e definições',
    icon: <Icons.Zap />,
    model: 'Groq (Llama 3)',
    color: '#22C55E',
  },
  {
    id: 'questoes_banca',
    title: 'Questões de Banca',
    description: 'Simula questões no estilo FCC, CESPE, FGV com pegadinhas reais',
    icon: <Icons.BookOpen />,
    model: 'Gemini 2.5 Flash',
    color: '#6366F1',
  },
  {
    id: 'logica_juridica',
    title: 'Lógica Jurídica',
    description: 'Exercícios de A vs B, silogismos e casos práticos',
    icon: <Icons.Scale />,
    model: 'Gemini 2.5 Flash',
    color: '#F59E0B',
  },
];
