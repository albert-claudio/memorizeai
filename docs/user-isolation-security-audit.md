# Auditoria de Isolamento Entre Usuarios (RLS)

Data: 2026-02-26
Escopo: `supabase/migrations`, rotas/API em `src/app/api`, server actions em `src/app/actions`, services client em `src/features`, policies de `storage.objects`.

## Resumo executivo

- Todas as 18 tabelas do schema `public` encontradas nas migrations estao com RLS habilitada.
- As policies ativas para dados de usuario seguem, em geral, o padrao de isolamento por `auth.uid()` (direto ou via relacao com tabelas donas do recurso).
- Buckets de storage usados pelo app (`pdfs`, `sources`) estao com escopo por pasta do proprio usuario (`(storage.foldername(name))[1] = auth.uid()::text`) e policy separada para `service_role`.
- Uso de `service_role` foi localizado em fluxos internos. Foi aplicado hardening para nao trafegar a service key bruta em header interno do endpoint `/api/runs/process`.

## Alteracoes aplicadas neste ciclo

### 1) Hardening do segredo interno de processamento de runs

Antes:

- `src/app/actions/createRun.ts` enviava `x-internal-secret` com `SUPABASE_SERVICE_ROLE_KEY`.
- `src/app/api/runs/process/route.ts` validava o mesmo valor bruto.

Agora:

- O sistema **requer** a variavel dedicada `RUNS_PROCESS_INTERNAL_SECRET`.
- Se a variavel nao estiver definida, o endpoint retorna 500 e a server action recusa criar runs.
- A chave `service_role` nao e mais usada nem trafegada no header `x-internal-secret`.

Arquivos alterados:

- `src/app/actions/createRun.ts`
- `src/app/api/runs/process/route.ts`

Validacao executada:

- `npx eslint src/app/actions/createRun.ts src/app/api/runs/process/route.ts` (sem erros).

## Inventario: tabelas `public`

Tabelas encontradas nas migrations:

- `card_references`
- `card_reviews`
- `cards`
- `chunks`
- `decks`
- `profiles`
- `runs`
- `simulado_questoes`
- `simulado_respostas`
- `simulados`
- `source_chunks`
- `sources`
- `study_goals`
- `subscriptions`
- `user_credits`
- `user_srs_settings`
- `user_weights`
- `webhook_logs`

Status RLS:

- 18/18 com RLS habilitada.
- Nenhuma tabela `public` do inventario com RLS ausente.

Tabelas citadas no checklist de negocio mas nao encontradas no schema atual:

- `sessions`
- `collections`
- `flashcards` (no schema atual o nome e `cards`)
- `quizzes` (no schema atual os dados estao em `simulados`, `simulado_questoes`, `simulado_respostas`)
- `files` (no schema atual o registro e `sources`; arquivo binario fica em storage)
- `generation_history` (no schema atual o historico principal e `runs`)
- `notes`
- `progress` (parte do progresso aparece em colunas como `status/progress` de `sources` e `runs`)

## Tabelas acessadas diretamente pelo client (browser)

Detectadas via arquivos que importam `@/lib/supabase/client` e usam `.from(...)`:

- `decks`
- `cards`
- `runs`
- `sources`
- `simulados`
- `simulado_questoes`
- `simulado_respostas`
- `user_srs_settings`
- `user_weights`
- `card_reviews`
- storage bucket `pdfs`

Conclusao:

- Todas as tabelas `public` acessadas no client estao com RLS habilitada.

## Revisao de policies por isolamento

Padrao esperado para dados do usuario:

- `SELECT`: somente recursos do proprio usuario.
- `INSERT`: `WITH CHECK` atrelado ao usuario autenticado.
- `UPDATE`: somente recursos do proprio usuario.
- `DELETE`: somente proprio usuario, ou bloqueado quando estrategia e soft delete.

Resultado por grupos:

- `profiles`: `profiles_select_own` por `auth.uid() = id`; escrita reservada a `service_role`.
- `decks`, `cards`, `runs`, `sources`, `simulados`: policies de leitura/escrita com `auth.uid()` (direto ou por relacao), com bloqueio de hard delete em tabelas criticas.
- `simulado_questoes`, `simulado_respostas`, `card_references`, `source_chunks`: leitura/escrita isolada por relacao com recurso dono do usuario.
- `user_srs_settings`, `user_weights`, `card_reviews`, `study_goals`: policies por `auth.uid() = user_id`.
- `subscriptions`, `user_credits`: leitura do proprio usuario; escrita restrita para `service_role`.
- `webhook_logs`: acesso exclusivo `service_role`.

## Fluxos com `service_role` revisados

Arquivos com uso de `service_role` (app runtime):

- `src/app/api/runs/route.ts`
- `src/app/api/process-source/route.ts`
- `src/app/api/runs/process/route.ts`
- `src/lib/ai/cost-guard.ts`
- `src/lib/security/webhook-security.ts`
- `src/app/api/stripe/webhook/route.ts`

Leitura de risco:

- `api/runs/route.ts`: usa auth do usuario e valida ownership antes de operacoes admin.
- `api/process-source/route.ts`: usa `requireAuthAndOwnership` antes de operacoes admin.
- `api/runs/process/route.ts`: endpoint interno com segredo em header; hardening aplicado para segredo dedicado/derivado.
- `webhook`/`webhook-security`: fluxo interno de webhook Stripe, sem exposicao de operacao admin para usuario comum.

## Storage (upload/download)

Policies ativas relevantes em `storage.objects`:

- Bucket `pdfs`: upload/select/delete somente em pasta do proprio usuario (`auth.uid()`).
- Bucket `sources`: upload/select/delete com escopo de pasta do proprio usuario (`auth.uid()`).
- Policies de `service_role` separadas para operacoes internas.

Conclusao:

- Nao foi encontrada policy aberta de storage permitindo acesso cross-tenant para usuarios autenticados comuns.

## Itens de atencao e recomendacoes

- ~~Definir explicitamente `RUNS_PROCESS_INTERNAL_SECRET`~~ — **Implementado**: variavel obrigatoria, sistema falha se ausente.
- Manter regra de nao aceitar `user_id` do cliente em rotas comuns quando o backend ja conhece o usuario pela sessao.
- Em toda rota com `service_role`, manter autorizacao previa explicita (auth + ownership + validacoes de negocio).
- Rodar periodicamente um checklist automatico de RLS/policies apos cada migration de schema.

## Observacoes sobre escopo da auditoria

- Esta auditoria foi baseada em leitura estatica do codigo e das migrations locais.
- Nao houve consulta direta ao catalogo do banco remoto nesta etapa.
- Para fechamento operacional, rodar validacao online no ambiente alvo (staging/prod) com queries de catalogo e testes de API sem auth.
