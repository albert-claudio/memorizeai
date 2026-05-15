import { createAppNotification, type CreateNotificationParams } from '@/lib/notifications/service';

type ContentReadyInput = {
  userId: string;
  sourceId: string;
  sourceFilename: string;
  processedChunks: number;
  reusedChunks: number;
};

type PlanRenewalInput = {
  userId: string;
  invoiceId: string;
  subscriptionId: string | null;
  billingReason: string | null;
  tier: string;
  paidPeriodEnd: number | null;
};

type ReviewReminderInput = {
  userId: string;
  overdueCount: number;
  dateKey: string;
};

type DailyGoalMissedInput = {
  userId: string;
  reviewedToday: number;
  dailyReviews: number;
  remaining: number;
  dateKey: string;
};

type StreakAlertInput = {
  userId: string;
  streak: number;
  dateKey: string;
};

type TestNotificationInput = {
  userId: string;
};

export function buildContentReadyNotification(params: ContentReadyInput): CreateNotificationParams {
  return {
    userId: params.userId,
    type: 'content_ready',
    title: 'Conteúdo processado',
    body: `${params.sourceFilename} terminou de ser processado e já pode gerar cards ou questões.`,
    ctaLabel: 'Abrir gerador',
    ctaUrl: '/dashboard/runs',
    metadata: {
      sourceId: params.sourceId,
      filename: params.sourceFilename,
      chunks: params.processedChunks,
      reusedChunks: params.reusedChunks,
    },
    dedupeKey: `content-ready:${params.sourceId}`,
  };
}

export function buildPlanRenewalNotification(params: PlanRenewalInput): CreateNotificationParams {
  return {
    userId: params.userId,
    type: 'plan_renewal',
    title: params.billingReason === 'subscription_cycle'
      ? 'Plano renovado com sucesso'
      : 'Pagamento do plano confirmado',
    body: params.paidPeriodEnd
      ? `Seu plano ${params.tier} está ativo até ${new Date(params.paidPeriodEnd).toLocaleDateString('pt-BR')}.`
      : `Seu pagamento do plano ${params.tier} foi confirmado com sucesso.`,
    importance: 'high',
    ctaLabel: 'Ver assinatura',
    ctaUrl: '/dashboard/settings',
    metadata: {
      invoiceId: params.invoiceId,
      subscriptionId: params.subscriptionId,
      billingReason: params.billingReason,
      tier: params.tier,
    },
    dedupeKey: `plan-renewal:${params.invoiceId}`,
  };
}

export function buildReviewReminderNotification(params: ReviewReminderInput): CreateNotificationParams {
  return {
    userId: params.userId,
    type: 'review_reminder',
    title: 'Revisões pendentes esperando você',
    body: `Você tem ${params.overdueCount} revisão(ões) vencida(s) para fazer hoje.`,
    ctaLabel: 'Revisar agora',
    ctaUrl: '/dashboard',
    metadata: { overdueCount: params.overdueCount },
    dedupeKey: `review-reminder:${params.userId}:${params.dateKey}`,
  };
}

export function buildDailyGoalMissedNotification(params: DailyGoalMissedInput): CreateNotificationParams {
  return {
    userId: params.userId,
    type: 'daily_goal_missed',
    title: 'Meta diária ainda não batida',
    body: `Faltam ${params.remaining} revisão(ões) para atingir sua meta diária de ${params.dailyReviews}.`,
    ctaLabel: 'Voltar a estudar',
    ctaUrl: '/dashboard',
    metadata: {
      reviewedToday: params.reviewedToday,
      dailyReviews: params.dailyReviews,
      remaining: params.remaining,
    },
    dedupeKey: `daily-goal:${params.userId}:${params.dateKey}`,
  };
}

export function buildStreakAlertNotification(params: StreakAlertInput): CreateNotificationParams {
  return {
    userId: params.userId,
    type: 'streak_alert',
    title: 'Sua sequência está em risco',
    body: `Você acumulou ${params.streak} dia(s) seguidos. Faça ao menos uma revisão hoje para não quebrar a sequência.`,
    importance: 'high',
    ctaLabel: 'Manter streak',
    ctaUrl: '/dashboard',
    metadata: { streak: params.streak },
    dedupeKey: `streak-alert:${params.userId}:${params.dateKey}`,
  };
}

export function buildTestNotification(params: TestNotificationInput): CreateNotificationParams {
  return {
    userId: params.userId,
    type: 'content_ready',
    title: 'Teste de notificação',
    body: 'Seu sistema de notificações do navegador está ativo e pronto para uso.',
    importance: 'medium',
    ctaLabel: 'Abrir settings',
    ctaUrl: '/dashboard/settings',
    metadata: { source: 'manual_test' },
  };
}

function resolveDraft(
  params: CreateNotificationParams | ContentReadyInput | PlanRenewalInput | ReviewReminderInput | DailyGoalMissedInput | StreakAlertInput | TestNotificationInput,
  builder: (input: any) => CreateNotificationParams, // eslint-disable-line @typescript-eslint/no-explicit-any
): CreateNotificationParams {
  return 'type' in params ? params : builder(params);
}

export async function emitContentReadyNotification(params: ContentReadyInput | CreateNotificationParams) {
  return createAppNotification(resolveDraft(params, buildContentReadyNotification));
}

export async function emitPlanRenewalNotification(params: PlanRenewalInput | CreateNotificationParams) {
  return createAppNotification(resolveDraft(params, buildPlanRenewalNotification));
}

export async function emitReviewReminderNotification(params: ReviewReminderInput | CreateNotificationParams) {
  return createAppNotification(resolveDraft(params, buildReviewReminderNotification));
}

export async function emitDailyGoalMissedNotification(params: DailyGoalMissedInput | CreateNotificationParams) {
  return createAppNotification(resolveDraft(params, buildDailyGoalMissedNotification));
}

export async function emitStreakAlertNotification(params: StreakAlertInput | CreateNotificationParams) {
  return createAppNotification(resolveDraft(params, buildStreakAlertNotification));
}

export async function emitTestNotification(params: TestNotificationInput | CreateNotificationParams) {
  return createAppNotification(resolveDraft(params, buildTestNotification));
}
