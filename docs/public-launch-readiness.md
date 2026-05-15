# Prontidao para Lancamento Publico

Data de referencia: 10 de abril de 2026

Este documento resume o estado atual da Vimens para abertura ao publico, com foco em:

- o que ja foi validado localmente
- o que ainda falta em staging/producao
- o que precisa estar fechado para um go-live seguro

## Resumo executivo

Status atual: quase pronto para lancamento publico.

O produto ja passou pelas validacoes tecnicas locais mais importantes:

- `npm run lint:ci` passou (corrigido em 2026-03-29: imports e estado mortos removidos)
- `npm run test` passou
- `npm run build` passou (corrigido em 2026-03-29: Suspense boundary adicionado em /redefinir-senha)

Os principais pontos restantes nao sao mais grandes implementacoes de produto. O que falta agora e:

- aplicar migration no banco alvo
- validar integracoes externas reais em staging
- conferir configuracoes de ambiente e seguranca em producao
- fechar readiness operacional e juridico

## O que ja esta pronto

### Backend e seguranca

- `/api/admin/funnel` usa o mesmo admin guard das outras rotas administrativas
- `/api/analytics/track` aceita apenas requests same-origin
- `/api/runs/process` exige `x-internal-secret`
- `POST /api/runs` agora delega para o mesmo pipeline da server action `createRun` (eliminada divergencia com edge function legada)
- Edge function `run-orchestrator` removida do codebase (necessario remover do deploy Supabase)
- checkout Stripe ja valida origins permitidas
- webhook Stripe possui validacao de assinatura, idempotencia e trilha de auditoria
- refund automatico dentro da janela de 7 dias foi implementado

### Observabilidade e operacao minima

- jobs de cron existem para:
  - recuperacao de runs
  - health check
  - alertas operacionais
- Sentry esta configurado no projeto
- `WEBHOOK_ALERT_URL` esta previsto para alertas operacionais

### Billing

- checkout existe
- confirmacao pos-checkout existe
- portal de billing existe
- cancelamento no fim do ciclo existe
- reembolso self-service com cancelamento imediato dentro da janela elegivel existe

## Pendencias reais antes do lancamento

## 1. Banco e deploy

- Aplicar `supabase/migrations/20260311_01_lock_app_events_insert.sql` em staging.
- Depois de validar em staging, aplicar a mesma migration em producao.
- Confirmar que a migration foi aplicada no banco realmente usado pelo deploy publico.

Sem isso, a protecao esperada para `app_events` pode nao refletir o estado do codigo.

## 2. Variaveis de ambiente

As variaveis abaixo precisam estar configuradas no ambiente de deploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `NEXT_PUBLIC_APP_URL`
- `RUNS_PROCESS_INTERNAL_SECRET`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `SECURITY_ALERT_EMAIL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `WEBHOOK_ALERT_URL`

Se Sentry for usado em producao, tambem configurar:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

## 3. Validacao externa em staging

Esses testes ainda precisam acontecer com servicos reais:

- Validar entrega real do webhook Stripe com evento assinado.
- Validar o fluxo de checkout ate retorno para dashboard.
- Validar `/api/stripe/confirm-checkout`.
- Validar o Billing Portal.
- Validar cancelamento no fim do ciclo.
- Validar reembolso automatico dentro da janela elegivel.
- Criar os schedules do QStash para os endpoints de cron.
- Validar os crons com assinatura valida do QStash.
- Confirmar Redis acessivel a partir do ambiente deployado.

Sem essa etapa, o build local estar verde nao garante que o ambiente publico esta correto.

## 4. Checagens de seguranca pos-deploy

- Confirmar que rotas admin exigem sessao autenticada, role admin no JWT, role admin no banco e MFA AAL2.
- Confirmar que `app_events` rejeita inserts diretos pelo endpoint publico do Supabase.
- Confirmar que o CSP em producao nao inclui `'unsafe-eval'`.
- Confirmar que checkout Stripe so aceita origins autorizadas.
- Confirmar que `/api/runs/process` rejeita requests sem `x-internal-secret`.

## 5. Readiness operacional

- Definir destino real do `WEBHOOK_ALERT_URL`:
  - Discord, Slack ou outro canal monitorado
- Definir dono da resposta a incidentes
- Definir rotina minima de acompanhamento:
  - webhook Stripe
  - health check
  - stuck runs
  - falhas de processamento
- Definir procedimento de incidente:
  - comunicacao
  - mitigacao
  - postmortem

Hoje a base tecnica existe, mas o processo operacional ainda precisa ser fechado.

## 6. Readiness juridico e comercial

- Revisar o texto final de `/termos`.
- Revisar o texto final de `/privacidade`.
- Confirmar se a copia juridica esta pronta para usuarios pagantes reais.
- Confirmar se a politica de suporte esta coerente com o que sera executado na pratica.

## Go-live: criterio minimo

Recomenda-se liberar o site ao publico apenas quando todos os itens abaixo estiverem fechados:

- migration aplicada em staging e producao
- env vars completas no deploy
- webhook Stripe validado em staging
- checkout, confirmacao, portal, cancelamento e refund testados com Stripe real
- crons funcionando via QStash com assinatura valida
- Redis confirmado no ambiente deployado
- canal de alertas configurado e monitorado
- textos juridicos revisados

## Avaliacao final

Se o objetivo for lancar para usuarios reais pagantes, o projeto esta em estado "quase pronto", mas ainda nao em "go-live imediato".

O bloqueio principal neste momento nao e codigo de aplicacao. O bloqueio principal e validacao de ambiente real e fechamento operacional.
