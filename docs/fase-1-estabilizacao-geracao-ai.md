# Fase 1: Estabilizacao da Geracao de IA sob Carga

Data de referencia: 18 de abril de 2026

Este documento descreve o que precisa ser implementado na Fase 1 para que a geracao de flashcards e, por extensao, o pipeline de geracao com IA, suporte carga real com degradacao controlada.

O foco aqui nao e "limpar codigo" nem reorganizar APIs por preferencia arquitetural. O foco e resolver o problema operacional real observado em teste com APIs reais:

- `100` runs simultaneas de flashcards
- `1` concluida
- `99` falharam
- `0` recuperaram sozinhas
- `18.220 ms` de janela total do teste

O problema principal nao foi falha funcional do pipeline em baixa carga. O teste de controle com `1` run real passou. O problema foi escala:

- chamadas demais para o `Groq` ao mesmo tempo
- budget de prompt ainda alto para flashcards
- tratamento ruim de `429` e timeout
- recovery lento demais para drenar backlog
- ausencia de fila real entre "criar run" e "processar run"

## Objetivo da Fase 1

Ao final desta fase, o sistema precisa ser capaz de receber rajadas de criacao de runs sem transformar isso imediatamente em rajadas equivalentes de chamadas para o provedor de IA.

O objetivo pratico e este:

- criar `100` runs simultaneas nao pode significar `100` requests imediatas para o `Groq`
- `429`, lentidao e timeouts devem empurrar a run para retry controlado, nao para erro em massa
- o sistema precisa processar em ondas controladas
- o circuit breaker nao pode virar um amplificador de falhas de rate limit
- o recovery precisa recuperar travamentos reais, nao servir de fila principal

## Escopo da Fase 1

Esta fase inclui:

- fila de execucao para runs
- limite de concorrencia por provedor
- lease de processamento para evitar duplicidade
- retry com backoff e jitter
- classificacao minima de erros de IA
- reducao do budget de chunks para flashcards
- ajuste do recovery cron
- correcao de observabilidade minima
- migration de suporte no banco

Esta fase nao inclui:

- reescrever todos os prompts
- reestruturar simulados em profundidade
- mudancas grandes de UX
- otimizacao fina de custos por modelo
- features novas para usuario final

## Estado Atual do Codigo

Hoje, os pontos mais relevantes sao estes:

- [createRun.ts](C:/Users/Albert/Documents/memorizeai/src/app/actions/createRun.ts) cria a run e ja tenta disparar `/api/runs/process`
- [route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/runs/route.ts) faz a mesma coisa no endpoint REST
- [route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/runs/process/route.ts) escolhe modelo e processa diretamente a run
- [prompt-budget.ts](C:/Users/Albert/Documents/memorizeai/src/lib/ai/prompt-budget.ts) usa um budget generico por caracteres, ainda agressivo para flashcards em `Groq`
- [cost-guard.ts](C:/Users/Albert/Documents/memorizeai/src/lib/ai/cost-guard.ts) trata circuit breaker e token budget, mas hoje o breaker reage mal a bursts de falha do provedor
- [route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/cron/recover-runs/route.ts) recupera backlog em lotes pequenos de `20`

O comportamento observado no teste real foi compativel com este desenho:

- muitas runs entrando ao mesmo tempo
- provedor comecando a responder `429`
- circuit breaker abrindo cedo
- varias runs indo direto para erro ou retry ruim
- recovery sem throughput suficiente

## Arquitetura Alvo da Fase 1

Fluxo desejado:

1. O usuario cria a run.
2. A run entra em `queued`.
3. Um dispatcher busca runs elegiveis.
4. O dispatcher aplica limite de concorrencia por provedor.
5. O dispatcher entrega a run para o processador.
6. O processador conclui, reprograma retry ou marca erro terminal.
7. O recovery cron so cuida de runs travadas ou leases expiradas.

Em termos praticos, a mudanca mais importante desta fase e:

- separar o ato de criar a run do ato de bater na IA

## Modelo de Estado Recomendado

Adicionar ou consolidar os seguintes estados em `runs`:

- `queued`
- `processando`
- `retry_wait`
- `concluido`
- `erro`

Semantica:

- `queued`: pronta para ser despachada
- `processando`: leased por um worker e em execucao
- `retry_wait`: falhou temporariamente e tem `next_attempt_at`
- `concluido`: terminou com sucesso
- `erro`: falha terminal ou estourou limite de tentativas

## Workstream 1: Migration e Campos de Controle

Criar uma migration nova em `supabase/migrations` com os campos abaixo na tabela `runs`:

- `next_attempt_at bigint null`
- `lease_expires_at bigint null`
- `last_error_code text null`
- `last_error_provider text null`
- `last_error_at bigint null`
- `provider_attempt_count int not null default 0`
- `processing_node text null`
- `token_count bigint null` caso ainda nao exista no banco real

Criar tambem indices para evitar scans desnecessarios:

- indice em `(status, next_attempt_at, created_at)`
- indice em `(status, lease_expires_at)`

O motivo desses campos:

- `next_attempt_at` controla quando a run pode voltar para fila
- `lease_expires_at` impede processamento duplicado
- `last_error_code` e `last_error_provider` permitem classificar comportamento e medir gargalo
- `provider_attempt_count` permite separar tentativas totais de tentativas contra um provedor
- `processing_node` ajuda a diagnosticar duplicidade ou comportamento estranho em multi-instancia
- `token_count` fecha a lacuna atual do `cost-guard`

Definicao de pronto deste workstream:

- migration criada
- migration aplicada localmente
- codigo consegue ler e gravar esses campos sem erro

## Workstream 2: Criacao de Run Deve Virar Enfileiramento

Arquivos a alterar:

- [createRun.ts](C:/Users/Albert/Documents/memorizeai/src/app/actions/createRun.ts)
- [route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/runs/route.ts)

O que mudar:

- remover o caminho principal `insert -> triggerProcessWithRetry -> /api/runs/process`
- ao criar a run, gravar:
  - `status='queued'`
  - `next_attempt_at=Date.now()`
  - `attempt_count=0`
  - `provider_attempt_count=0`
- manter a resposta ao frontend simples e rapida

O que corrigir:

- hoje `createRun` e `POST /api/runs` ainda funcionam como fire-and-forget
- isso e aceitavel em baixa carga, mas ruim em rajada

Resultado esperado:

- `100` usuarios podem criar runs quase ao mesmo tempo
- o banco absorve a criacao
- o sistema nao tenta conversar com o provedor `100` vezes no mesmo instante

Definicao de pronto deste workstream:

- nenhuma criacao de run chama o processador diretamente como fluxo principal
- todas as runs novas entram em `queued`

## Workstream 3: Dispatcher da Fila

Criar um endpoint ou job novo:

- `src/app/api/cron/process-queue/route.ts`

Responsabilidade do dispatcher:

- buscar runs `queued` ou `retry_wait`
- filtrar por `next_attempt_at <= now`
- ignorar runs com `lease_expires_at > now`
- ordenar por `created_at`
- pegar um lote configuravel
- aplicar lease antes de despachar
- respeitar capacidade por provedor

Configuracoes iniciais recomendadas:

- `QUEUE_BATCH_SIZE=25`
- `GROQ_FLASHCARD_MAX_CONCURRENT=5`
- `GEMINI_QUESTOES_MAX_CONCURRENT=2`
- `RUN_LEASE_MS=90000`

Comportamento esperado:

- o dispatcher roda em intervalos curtos
- ele move poucas runs por vez
- se nao houver slot no provedor, a run continua em `queued`

Ponto importante:

- o dispatcher nao deve fazer trabalho de IA
- ele so decide "quem pode tentar agora"

Definicao de pronto deste workstream:

- existe um job funcional de despacho
- o lote e controlado por configuracao
- a run so sai de `queued` quando consegue lease valido

## Workstream 4: Limite de Concorrencia por Provedor

Criar um modulo novo:

- `src/lib/ai/provider-capacity.ts`

Esse modulo deve:

- expor capacidade maxima por provedor e por tipo de run
- reservar slot antes do processamento
- liberar slot no final
- usar Redis quando disponivel
- usar fallback em memoria apenas para dev ou testes locais

Chaves sugeridas no Redis:

- `queue:lease:groq:flashcards`
- `queue:lease:groq:questoes`
- `queue:lease:gemini:questoes`

Primeira regra pragmatica:

- flashcards com `auto` devem ser tratados como consumo de capacidade `Groq`

Motivo:

- o gargalo real medido hoje esta no `Groq` para flashcards

Definicao de pronto deste workstream:

- o sistema nunca despacha mais runs para um provedor do que o teto configurado
- o teto pode ser alterado por env sem mudar codigo

## Workstream 5: Processador Deve Diferenciar Falha Temporaria de Falha Terminal

Arquivo principal:

- [route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/runs/process/route.ts)

O processador precisa parar de tratar toda falha como quase a mesma coisa.

Classificacao minima recomendada:

- `rate_limit`
- `timeout`
- `provider_unavailable`
- `payload_too_large`
- `invalid_json`
- `fatal_business_rule`

Mapeamento inicial:

- `429` do provedor -> `rate_limit`
- timeout -> `timeout`
- `5xx`, erro de conexao, DNS, indisponibilidade -> `provider_unavailable`
- `413` ou mensagem de budget excedido -> `payload_too_large`
- resposta invalida ou parse impossivel -> `invalid_json`
- erro de regra de negocio, entrada invalida, fonte ausente -> `fatal_business_rule`

Politica esperada:

- `rate_limit` -> `retry_wait`
- `timeout` -> `retry_wait`
- `provider_unavailable` -> `retry_wait`
- `payload_too_large` -> `retry_wait` com budget reduzido
- `invalid_json` -> retry limitado, depois `erro`
- `fatal_business_rule` -> `erro`

Gravar sempre:

- `last_error_code`
- `last_error_provider`
- `last_error_at`

Definicao de pronto deste workstream:

- toda falha relevante cai em uma classe conhecida
- apenas erros realmente terminais vao direto para `erro`

## Workstream 6: Retry com Backoff e Jitter

Criar um modulo novo:

- `src/lib/ai/retry-policy.ts`

Politica inicial sugerida:

- tentativa 1 -> `+30s`
- tentativa 2 -> `+90s`
- tentativa 3 -> `+180s`

Adicionar jitter:

- multiplicador entre `0.8` e `1.2`

Regras:

- atualizar `next_attempt_at`
- devolver a run para `retry_wait`
- incrementar `attempt_count`
- incrementar `provider_attempt_count` apenas quando de fato houve chamada ao provedor

O que esta sendo corrigido aqui:

- hoje a aplicacao tenta muito cedo e de forma pouco coordenada
- isso piora burst de `429`

Definicao de pronto deste workstream:

- runs temporariamente falhas voltam para a fila com atraso progressivo
- retries simultaneos deixam de acontecer em bloco

## Workstream 7: Ajuste do Circuit Breaker

Arquivo:

- [cost-guard.ts](C:/Users/Albert/Documents/memorizeai/src/lib/ai/cost-guard.ts)

Problema atual:

- em carga real, `429` em burst acaba contribuindo para o circuit breaker abrir
- isso transforma rate limiting do provedor em indisponibilidade quase total do sistema

Correcao recomendada:

- o circuit breaker deve abrir para falhas que indiquem indisponibilidade real do provedor
- `429` e `payload_too_large` nao devem ter o mesmo peso de `5xx` e falha de rede

Regra inicial:

- contam para breaker:
  - `provider_unavailable`
  - falhas de rede
  - timeout repetido em janela curta
- nao contam para breaker:
  - `rate_limit`
  - `payload_too_large`

Definicao de pronto deste workstream:

- rajadas de `429` passam a desacelerar a fila
- rajadas de `429` deixam de derrubar quase todas as runs por breaker aberto

## Workstream 8: Budget de Chunks para Flashcards

Arquivos:

- [prompt-budget.ts](C:/Users/Albert/Documents/memorizeai/src/lib/ai/prompt-budget.ts)
- [route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/runs/process/route.ts)

Problema atual:

- o budget generico ainda permite payload alto para flashcards
- em baixa carga pode funcionar
- sob concorrencia real, isso piora limite de tokens por minuto e risco de `payload_too_large`

Mudanca recomendada:

- criar politica especifica para flashcards em `Groq`
- limitar total de chunks
- limitar chars por chunk
- truncar chunk longo
- reduzir ainda mais em retry por `payload_too_large`

Politica inicial pragmatica:

- `maxChunks=4`
- `maxCharsPerChunk=1200`
- `maxCharsTotal=10000`

Politica de retry quando houver `payload_too_large`:

- `maxChunks=3`
- `maxCharsPerChunk=900`
- `maxCharsTotal=7000`

Selecao recomendada:

- ranquear chunks por relevancia antes
- priorizar diversidade de conteudo
- nao mandar chunk inteiro so porque ele existe

Definicao de pronto deste workstream:

- flashcards usam budget proprio
- retry por payload reduz o budget automaticamente

## Workstream 9: Recovery Cron Deve Virar Recuperacao, Nao Fila Principal

Arquivo:

- [route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/cron/recover-runs/route.ts)

Problema atual:

- o recovery trabalha em lotes pequenos de `20`
- ele ainda esta muito proximo da ideia de "retriggerar processamento"
- isso e pouco para backlog grande

Correcao recomendada:

- o recovery deve focar em runs travadas
- o caminho normal de despacho deve ser o `process-queue`
- o recovery deve reencaminhar para a fila, nao explodir chamadas de IA de novo

Mudancas praticas:

- subir lote para algo como `100`
- recuperar:
  - `processando` com lease expirado
  - `queued` ou `retry_wait` esquecidas alem de uma janela razoavel
- ao recuperar, devolver para `queued` com `next_attempt_at=now`

Definicao de pronto deste workstream:

- backlog grande nao depende mais de lotes de `20`
- recovery deixa de ser o mecanismo principal de throughput

## Workstream 10: Observabilidade Minima para Confiar no Comportamento

Arquivos:

- [route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/runs/process/route.ts)
- `src/lib/logger` e modulos relacionados, se necessario

Problema atual:

- existe uso de `_log` global no processador
- em concorrencia, isso polui a leitura dos logs e dificulta diagnostico

Correcao recomendada:

- logger por request
- sempre incluir:
  - `runId`
  - `objective`
  - `model`
  - `attempt_count`
  - `provider_attempt_count`
  - `error_code`
  - `lease_expires_at`

Tambem vale registrar eventos padrao:

- `run_enqueued`
- `run_leased`
- `run_dispatched`
- `run_retry_scheduled`
- `run_failed_terminal`
- `run_completed`

Definicao de pronto deste workstream:

- cada run fica rastreavel do enfileiramento ate o fim
- comportamento em carga deixa de depender de leitura manual confusa

## Ordem Recomendada de Implementacao

Implementar nesta ordem:

1. migration da tabela `runs`
2. criacao de run em `queued`
3. dispatcher `process-queue`
4. provider capacity com limite por provedor
5. classificacao de erro e retry/backoff
6. ajuste do circuit breaker
7. budget especifico de flashcards
8. recovery novo
9. observabilidade minima

O motivo dessa ordem:

- primeiro voce para de piorar o problema
- depois voce controla throughput
- so entao voce melhora eficiencia de prompt e estabilidade fina

## Variaveis de Ambiente Recomendadas

Adicionar ou revisar:

- `QUEUE_BATCH_SIZE`
- `RUN_LEASE_MS`
- `GROQ_FLASHCARD_MAX_CONCURRENT`
- `GROQ_QUESTOES_MAX_CONCURRENT`
- `GEMINI_QUESTOES_MAX_CONCURRENT`
- `AI_RETRY_BASE_DELAY_MS`
- `AI_RETRY_MAX_ATTEMPTS`
- `FLASHCARDS_GROQ_MAX_CHUNKS`
- `FLASHCARDS_GROQ_MAX_CHARS_TOTAL`
- `FLASHCARDS_GROQ_MAX_CHARS_PER_CHUNK`

## Criterios de Aceite da Fase 1

A fase so deve ser considerada pronta quando estes pontos forem verdade:

- criar `100` runs simultaneas nao dispara `100` chamadas imediatas ao provedor
- `429` vira `retry_wait` e nao falha em massa
- o circuit breaker nao abre apenas por burst curto de rate limit
- runs fluem em ondas controladas
- nenhuma run fica travada sem lease valido por mais de `3 min`
- `token_count` volta a ser persistido corretamente
- os logs permitem identificar claramente o destino de cada run

## Plano de Verificacao

### Validacao automatizada

Executar:

- `npm run lint:ci`
- `npm run test`
- `npm run build`

Adicionar testes para:

- transicao de `queued -> processando -> concluido`
- transicao de `queued -> processando -> retry_wait`
- lease expirado
- limite de concorrencia por provedor
- retry com jitter e backoff
- reducao de budget por `payload_too_large`

### Validacao real progressiva

Rodar com APIs reais em etapas:

- `10` runs simultaneas
- `25` runs simultaneas
- `50` runs simultaneas
- `75` runs simultaneas
- `100` runs simultaneas

Medir sempre:

- tempo total
- sucesso final
- falha terminal
- quantidade de `retry_wait`
- quantidade de `429`
- quantidade de recuperacoes
- `p95` de conclusao

## Riscos Conhecidos

Mesmo apos a Fase 1, alguns riscos ainda vao existir:

- limite real do provedor pode continuar variando conforme conta e plano
- in-memory fallback nao protege multi-instancia em producao
- simulados continuam tendo perfil de custo diferente de flashcards
- budget por chunks ainda pode precisar de calibracao fina por tipo de fonte

Esses riscos sao aceitaveis nesta fase porque a meta aqui nao e zerar todo risco operacional. A meta e impedir colapso por rajada curta e criar uma base segura para tuning posterior.

## Resultado Esperado da Fase 1

Se esta fase for implementada corretamente, o comportamento esperado deixa de ser:

- "100 usuarios clicaram em gerar, entao 100 requests bateram no provedor ao mesmo tempo"

e passa a ser:

- "100 usuarios clicaram em gerar, as runs entraram em fila, o sistema liberou em ondas controladas, retries aconteceram com atraso e o backlog foi drenado sem colapso"

Esse e o criterio operacional minimo para poder confiar no fluxo de geracao antes de abrir mais carga em producao.
