# Migracao Para OpenAI: Plano Executavel Por PR

## Objetivo

Este documento quebra o plano de migracao para OpenAI em entregas pequenas, verificaveis e seguras para implementacao incremental.

Meta final:

- migrar flashcards para OpenAI
- reduzir fortemente o consumo de tokens
- manter qualidade
- medir custo por run
- escalar sem estourar credito rapidamente

## Principios de Execucao

- nenhuma PR deve misturar infraestrutura, custo, benchmark e rollout final ao mesmo tempo
- toda PR deve ter criterio de aceite claro
- toda PR deve deixar o sistema em estado funcional
- o caminho antigo deve continuar operando ate a flag de troca
- toda mudanca sensivel deve sair com telemetria

## Ordem Recomendada

1. Observabilidade e preparacao de schema
2. Abstracao de provedor
3. Integracao OpenAI basica
4. Prompt policy enxuta para flashcards
5. Source digest
6. Prompt caching e controle de custo
7. Benchmark de qualidade
8. Rollout progressivo

---

## PR 1: Schema e Telemetria de Custo

### Objetivo

Persistir uso real de tokens e custo por run.

Sem isso, nao existe controle economico confiavel da migracao.

### Mudancas

Adicionar campos em `runs` para:

- `provider text null`
- `input_tokens bigint null`
- `output_tokens bigint null`
- `cached_tokens bigint null`
- `estimated_cost_usd numeric(12,6) null`
- `source_digest_version text null`

Se quiser granularidade maior, opcionalmente:

- `raw_usage jsonb null`

### Arquivos

- `supabase/migrations/<nova_migration>.sql`
- `src/lib/types/index.ts`
- `src/app/api/runs/process/route.ts`

### Implementacao

1. criar migration de colunas em `runs`
2. atualizar tipos do projeto
3. garantir que o processador consiga preencher esses campos quando o provider retornar usage
4. se o provider nao retornar usage, persistir `null`, nunca inventar valor

### Criterio de aceite

- novas runs conseguem salvar `provider`, `model_used`, tokens e custo estimado
- o fluxo atual continua funcionando mesmo sem OpenAI ativado
- nenhum insert/update quebra por schema

### Verificacao

- teste local de processamento
- validação direta no banco

---

## PR 2: Abstracao de Provedor

### Objetivo

Remover acoplamento entre `runs/process` e um provider especifico.

### Arquivos novos sugeridos

- `src/lib/ai/provider-router.ts`
- `src/lib/ai/types.ts`
- `src/lib/ai/cost-estimator.ts`

### Contrato sugerido

Criar um tipo padrao de resposta:

```ts
export interface AITextResult {
  provider: 'groq' | 'openai' | 'gemini';
  model: string;
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  estimatedCostUsd?: number;
  rawUsage?: unknown;
}
```

E um contrato unico de chamada:

```ts
export interface AITextRequest {
  provider: 'groq' | 'openai' | 'gemini';
  model: string;
  system: string;
  user: string;
  promptCacheKey?: string;
}
```

### Implementacao

1. criar o router
2. mover logica de chamada de provider para adapters
3. manter Groq funcionando pelo router
4. parar de chamar SDK/provider diretamente em `runs/process`

### Arquivos a alterar

- `src/app/api/runs/process/route.ts`
- possivelmente `src/lib/ai/*` existentes

### Criterio de aceite

- Groq continua funcionando pelo router novo
- nenhuma regressao no fluxo atual
- `runs/process` depende do router e nao do SDK especifico

### Verificacao

- testes existentes de stress e process
- lint e typecheck dos adapters

---

## PR 3: Cliente OpenAI Basico

### Objetivo

Adicionar suporte real a OpenAI sem ligar ainda por padrao.

### Arquivos novos sugeridos

- `src/lib/ai/openai.ts`

### Implementacao

1. criar client OpenAI com `OPENAI_API_KEY`
2. usar Responses API ou endpoint equivalente padronizado pelo projeto
3. mapear usage para:
   - input tokens
   - output tokens
   - cached tokens
4. estimar custo em USD usando tabela local de preco
5. retornar tudo pelo contrato do router

### Requisitos

- escolher inicialmente `gpt-4o-mini` como modelo padrao para flashcards
- deixar `gpt-5-mini` configuravel por env/flag

### Variaveis sugeridas

- `OPENAI_API_KEY`
- `OPENAI_FLASHCARDS_MODEL=gpt-4o-mini`
- `OPENAI_FLASHCARDS_FALLBACK_MODEL=gpt-5-mini`

### Criterio de aceite

- chamada isolada a OpenAI funciona
- tokens e custo retornam corretamente
- nenhuma rota de producao depende disso ainda

### Verificacao

- teste isolado do adapter
- smoke de request real unico

---

## PR 4: Feature Flag e Selecao de Provedor

### Objetivo

Permitir ligar OpenAI apenas para parte do trafego.

### Implementacao

Criar regra de escolha de provider/modelo para flashcards:

- default atual continua
- OpenAI entra por flag

### Flags sugeridas

- `FLASHCARDS_PROVIDER=groq|openai`
- `FLASHCARDS_OPENAI_PERCENT=0`
- `FLASHCARDS_OPENAI_MODEL=gpt-4o-mini`

### Arquivos

- `src/lib/ai/provider-router.ts`
- `src/app/api/runs/process/route.ts`
- `src/lib/feature-flags.ts` se existir

### Regra recomendada

- usar rollout percentual por hash do `runId`
- assim o comportamento fica deterministico

### Criterio de aceite

- e possivel mandar apenas parte das runs para OpenAI
- e possivel voltar 100% para Groq via env

### Verificacao

- teste com `0%`
- teste com `100%`
- teste com percentual intermediario

---

## PR 5: Prompt Policy Agressiva Para Flashcards

### Objetivo

Reduzir muito o custo por run antes da migracao total.

### Arquivos

- `src/lib/ai/prompt-policy.ts`
- `src/app/api/runs/process/route.ts`
- `src/lib/ai/prompt-budget.ts`

### Meta

Para flashcards:

- `maxChunks=2` ou `3`
- `maxCharsPerChunk=700-900`
- `maxCharsTotal=2500-4000`

### Implementacao

1. criar policy especifica para OpenAI flashcards
2. reduzir instrucoes de prompt
3. manter schema curto
4. remover verbosity desnecessaria do output

### Mudanca importante

Separar claramente:

- prompt de flashcards
- prompt de simulados

Nao compartilhar budget entre fluxos muito diferentes.

### Criterio de aceite

- tokens medios por run caem visivelmente
- qualidade minima se mantem em amostra de teste
- retries nao aumentam por falta de contexto

### Verificacao

- benchmark pequeno de 10 fontes
- medir tokens antes/depois

---

## PR 6: Persistencia de Digesto da Fonte

### Objetivo

Parar de pagar “compreensao do documento” em toda run.

### Estrategia

Gerar um `source_digest` no pipeline de processamento da fonte.

### Tabela nova sugerida

`source_digests`

Campos:

- `id`
- `source_id`
- `version`
- `provider`
- `model_used`
- `content_json`
- `token_count`
- `estimated_cost_usd`
- `created_at`
- `updated_at`

### Arquivos

- `supabase/migrations/<nova_migration>.sql`
- `src/app/api/process-source/route.ts`
- `src/lib/source-digest.ts`
- `src/lib/source-digest-prompts.ts`

### Conteudo do digest

- topicos principais
- conceitos
- definicoes
- excecoes
- relacoes entre temas
- trechos curtos ancorados

### Regra

- toda fonte nova gera digest
- runs de flashcards passam a preferir digest
- fallback para chunks crus apenas se digest nao existir

### Criterio de aceite

- fontes novas geram digest com sucesso
- runs usam digest quando disponivel
- custo medio por run cai em relacao ao modo chunk bruto

### Verificacao

- testar upload/processamento
- verificar linhas em `source_digests`

---

## PR 7: Flashcards Baseados em Digest

### Objetivo

Mudar o fluxo de geracao de flashcards para usar digest como contexto principal.

### Arquivos

- `src/app/api/runs/process/route.ts`
- `src/lib/source-digest.ts`
- prompts de flashcard

### Implementacao

1. ao processar run de flashcards, buscar digest da fonte
2. montar prompt com o resumo estruturado
3. usar chunks crus apenas como fallback
4. persistir em `runs.source_digest_version`

### Meta

Levar o contexto medio de flashcards para faixa muito menor do que o fluxo atual.

### Criterio de aceite

- runs com digest usam menos tokens
- qualidade continua aceitavel
- fallback para chunks ainda funciona

### Verificacao

- comparar tokens por run com e sem digest

---

## PR 8: Prompt Caching da OpenAI

### Objetivo

Reduzir custo e latencia reaproveitando prefixos fixos do prompt.

### Arquivos

- `src/lib/ai/openai.ts`
- prompts usados em flashcards

### Implementacao

1. garantir prefixo fixo:
   - system prompt
   - instrucoes
   - schema
2. colocar contexto dinamico no final
3. adicionar `prompt_cache_key`
4. persistir `cached_tokens`

### Observacao

Prompt caching depende de prefixo identico. Se o prompt for reorganizado de forma ruim, o ganho desaparece.

### Criterio de aceite

- requests elegiveis retornam `cached_tokens`
- custo de input cai em cenarios repetidos

### Verificacao

- repetir runs com o mesmo prefixo
- comparar usage com e sem cache hit

---

## PR 9: Cost Guard Operacional

### Objetivo

Controlar gasto diario e evitar que a conta seja consumida em poucas horas.

### Arquivos

- `src/lib/ai/cost-guard.ts`
- `src/app/api/runs/process/route.ts`

### Regras recomendadas

- budget diario global
- budget diario por usuario
- budget diario por source
- downgrade automatico:
  - `gpt-5-mini -> gpt-4o-mini`
- opcionalmente bloquear runs nao premium quando o teto for atingido

### Variaveis sugeridas

- `AI_DAILY_BUDGET_USD`
- `AI_DAILY_BUDGET_PER_USER_USD`
- `AI_PREMIUM_MODEL_BUDGET_USD`

### Criterio de aceite

- sistema consegue degradar antes de estourar custo
- alertas e logs deixam claro quando houve downgrade

### Verificacao

- simular budget baixo
- validar downgrade e bloqueio

---

## PR 10: Benchmark de Qualidade

### Objetivo

Confirmar que o modelo barato entrega qualidade suficiente.

### Implementacao

Montar conjunto fixo de fontes reais.

Comparar:

- fluxo atual
- OpenAI `gpt-4o-mini`
- OpenAI `gpt-5-mini`

### Criterios avaliados

- fidelidade ao texto
- clareza
- cobertura
- duplicacao
- alucinacao

### Saida esperada

Documento de benchmark com decisao objetiva:

- `gpt-4o-mini` aprovado ou nao
- quando usar `gpt-5-mini`

### Criterio de aceite

- decisao de modelo baseada em evidencia

---

## PR 11: Teste Real Progressivo em OpenAI

### Objetivo

Medir custo e throughput real apos a otimizacao.

### Rodadas

- `10`
- `25`
- `50`
- `100`

### Medir

- tempo total
- concluidas
- falhas
- retries
- input tokens medios
- output tokens medios
- cached tokens
- custo medio por run
- custo total do lote

### Saida

Arquivos de summary equivalentes ao harness atual, mas para OpenAI.

### Criterio de aceite

- sistema aguenta a carga alvo definida
- custo por lote fica dentro do esperado

---

## PR 12: Rollout Progressivo

### Objetivo

Entrar em producao com baixo risco.

### Fases

- `5%`
- `25%`
- `50%`
- `100%`

### Guardrails

- rollback por env
- dashboard de custo
- dashboard de falha/retry

### Criterio de aceite

- nenhuma regressao importante
- custo sob controle
- qualidade aprovada

---

## Checklist Consolidado

### Infra

- [ ] migration de uso/custo em `runs`
- [ ] migration de `source_digests`
- [ ] env vars de OpenAI

### Codigo

- [ ] provider router
- [ ] adapter OpenAI
- [ ] cost estimator
- [ ] prompt policy enxuta
- [ ] source digest generation
- [ ] digest-first flashcards
- [ ] prompt caching
- [ ] downgrade por budget

### Produto

- [ ] benchmark de qualidade
- [ ] teste real progressivo
- [ ] rollout percentual

---

## Recomendacao de Execucao Imediata

Se a meta e reduzir risco rapidamente, a ordem mais eficiente e:

1. PR 1
2. PR 2
3. PR 3
4. PR 5
5. PR 6
6. PR 7
7. PR 8
8. PR 9
9. PR 10
10. PR 11
11. PR 12

Motivo:

- primeiro medir
- depois integrar provider
- depois cortar tokens
- depois validar custo e qualidade
- por fim abrir rollout

## Proximo Passo Recomendado

Comecar pela PR 1 e PR 2.

Sem telemetria e sem abstracao de provider, o restante da migracao fica mais caro, mais arriscado e mais dificil de validar.
