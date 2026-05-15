# Migracao Para OpenAI Com Otimizacao Forte de Tokens

## Objetivo

Migrar o pipeline de geracao de flashcards para OpenAI de forma segura, com foco em:

- sustentar carga alta sem depender de cotas muito restritas do provedor atual
- manter qualidade de geracao
- reduzir drasticamente o consumo de tokens por run
- evitar que o credito da conta acabe rapidamente
- preservar a arquitetura de fila e recuperacao da Fase 1

Este documento descreve o plano tecnico recomendado para a migracao, a estrategia de custo, a ordem de implementacao e os criterios de aceite.

## Diagnostico

Os testes reais mostraram que o principal problema atual nao e apenas estabilidade do codigo. O problema real e a combinacao de:

- limite de tokens por minuto do provedor
- limite de tokens por dia do provedor
- custo alto por run quando o contexto enviado e grande
- retries que multiplicam o consumo total quando ha rate limit

Com a Fase 1, o sistema passou a degradar de forma controlada:

- enfileira
- limita concorrencia
- reprograma retry
- evita avalanche imediata

Mas isso nao resolve sozinho o problema economico. Se cada run continua cara, uma fila mais organizada apenas consome a cota de forma mais gradual.

## Principio Central

Nao basta trocar de provedor.

Para escalar com OpenAI sem queimar credito, a aplicacao precisa:

1. reduzir o custo por run
2. reaproveitar contexto sempre que possivel
3. usar modelos baratos no caminho padrao
4. reservar modelos melhores e mais caros para casos especiais
5. medir tokens e custo por run de forma persistente

## Decisao de Modelo

Recomendacao inicial para flashcards:

- modelo padrao: `gpt-4o-mini`
- fallback de qualidade: `gpt-5-mini`
- evitar `gpt-5.4 mini` no fluxo principal de flashcards neste momento

Motivo:

- `gpt-4o-mini` tende a oferecer a melhor relacao custo/volume para geracao simples e estruturada
- `gpt-5-mini` pode ser usado quando a qualidade do `gpt-4o-mini` nao for suficiente
- modelos acima disso encarecem o fluxo sem necessidade clara para flashcards de alto volume

Observacao importante:

- OpenAI tambem possui rate limits e usage tiers
- trocar para OpenAI nao significa capacidade infinita
- ainda sera necessario manter fila, limite de concorrencia e retry controlado

## Referencias Oficiais

- Pricing: [https://platform.openai.com/docs/pricing/](https://platform.openai.com/docs/pricing/)
- Rate limits: [https://platform.openai.com/docs/guides/rate-limits/rate-limits-in-headers](https://platform.openai.com/docs/guides/rate-limits/rate-limits-in-headers)
- Prompt caching: [https://platform.openai.com/docs/guides/prompt-caching/overview](https://platform.openai.com/docs/guides/prompt-caching/overview)
- Batch API: [https://platform.openai.com/docs/guides/batch/getting-started?lang=curl](https://platform.openai.com/docs/guides/batch/getting-started?lang=curl)

## Meta de Custo

Antes da migracao, o produto precisa assumir um teto de custo por run.

Meta recomendada para flashcards:

- input tokens por run: `<= 1500`
- output tokens por run: `<= 500`
- custo medio por run: acompanhar em USD de forma persistida

Faixa ideal:

- fluxo padrao: `gpt-4o-mini`
- custo por run muito baixo
- tolerancia a carga maior

Faixa premium:

- `gpt-5-mini`
- apenas quando a qualidade justificar

## Meta de Qualidade

A migracao nao pode ser feita apenas por custo.

O fluxo novo precisa manter:

- fidelidade ao material de origem
- clareza didatica
- baixa duplicacao
- baixa alucinacao
- boa cobertura dos topicos importantes

## Problema Estrutural Atual

Hoje, cada run ainda consome contexto demais.

Mesmo com prompt budget menor, o modelo continua recebendo trechos relativamente grandes do documento em toda geracao. Isso cria dois problemas:

- custo recorrente por run
- baixa eficiencia em cenarios onde varias runs usam a mesma fonte

O erro arquitetural a evitar e este:

- pagar custo de compreensao do documento toda vez que um usuario pede novos flashcards

## Arquitetura Alvo

### Fluxo proposto

1. upload e processamento da fonte
2. criacao de um artefato reutilizavel da fonte
3. criacao da run apenas em fila
4. dispatcher despacha conforme capacidade
5. run de flashcards usa contexto comprimido e barato
6. resultado e salvo
7. custo e tokens sao persistidos

### Ideia central

Separar:

- custo de entender a fonte
- custo de gerar flashcards

Essa separacao e o maior ganho economico da migracao.

## Workstream 1: Abstracao de Provedor

### Objetivo

Introduzir OpenAI sem acoplar o pipeline inteiro a um provider especifico.

### Arquivos sugeridos

- `src/lib/ai/openai.ts`
- `src/lib/ai/provider-router.ts`
- `src/lib/ai/types.ts`

### O que implementar

Padronizar uma interface unica para chamadas de IA com retorno contendo:

- `text`
- `provider`
- `model`
- `inputTokens`
- `outputTokens`
- `cachedTokens`
- `estimatedCostUsd`
- `rawUsage`

### Requisito

O `runs/process` nao deve conhecer detalhes do SDK de cada provedor. Ele deve chamar apenas o router.

## Workstream 2: Source Digest

### Objetivo

Criar um artefato barato e reutilizavel por `source_id`, para evitar mandar chunks grandes em toda run.

### Ideia

Durante o processamento da fonte, gerar um `source_digest` estruturado com:

- topicos principais
- conceitos centrais
- definicoes
- excecoes
- relacoes importantes
- pegadinhas
- trechos curtos ancorados

### Resultado esperado

Quando o usuario pedir flashcards, a run deve preferir o `source_digest` em vez dos chunks brutos.

### Arquivos sugeridos

- `src/app/api/process-source/route.ts`
- `src/lib/source-digest.ts`
- `src/lib/source-digest-prompts.ts`

### Migration sugerida

Nova tabela `source_digests`, por exemplo:

- `id`
- `source_id`
- `version`
- `model_used`
- `provider`
- `content_json`
- `token_count`
- `estimated_cost_usd`
- `created_at`
- `updated_at`

### Regra de negocio

- uma fonte pode ter varias versoes de digest
- a run sempre usa a ultima versao valida
- se nao houver digest, cai para fallback com chunks

## Workstream 3: Prompt Policy Minimalista

### Objetivo

Reduzir o tamanho do contexto enviado ao modelo no fluxo de flashcards.

### Regra

Flashcard nao precisa de contexto longo nem de resposta longa.

### Politica alvo para flashcards

Se ainda estiver usando chunks:

- `maxChunks=2` ou `3`
- `maxCharsPerChunk=700-900`
- `maxCharsTotal=2500-4000`

Se estiver usando `source_digest`:

- contexto util entre `1200` e `2500` chars

### Arquivos

- `src/lib/ai/prompt-policy.ts`
- `src/app/api/runs/process/route.ts`

### Regras adicionais

- cortar instrucoes redundantes
- schema JSON pequeno
- remover texto explicativo longo
- remover exemplos se nao forem estritamente necessarios

## Workstream 4: Prompt Caching

### Objetivo

Aproveitar prompt caching da OpenAI para reduzir custo e latencia.

### Como funciona

Para prompts maiores, a OpenAI pode aproveitar prefixos identicos entre requests.

### Estrutura recomendada

1. system prompt fixo
2. instrucoes fixas
3. schema fixo
4. exemplos fixos, se existirem
5. contexto dinamico no fim

### Regras

- o prefixo precisa ser identico entre requests
- o conteudo variavel deve ficar por ultimo
- usar `prompt_cache_key` consistente por tipo de tarefa

### Beneficio esperado

- menor custo de input repetido
- menor latencia em carga

## Workstream 5: Reducao de Output

### Objetivo

Baixar o custo de output, que pode crescer rapido em volume alto.

### Schema recomendado

Cada flashcard deve conter apenas:

- `front`
- `back`
- `chunkId`
- `citationExcerpt`

### O que evitar

- comentarios longos
- explicacoes excessivas
- metadata desnecessaria
- formatos verbosos

## Workstream 6: Remocao de Chamadas Desnecessarias

### Objetivo

Eliminar chamadas de IA redundantes no fluxo de flashcards.

### Politica recomendada

- uma chamada principal por run
- refill apenas se vier abaixo de um piso minimo
- sem reviewer por IA para flashcards padrao

### Observacao

Revisao por IA deve ser reservada para:

- simulados
- casos premium
- avaliacao offline de qualidade

## Workstream 7: Ranking de Contexto Sem LLM

### Objetivo

Selecionar contexto barato antes da chamada ao modelo.

### Abordagem

Usar logica deterministica antes da IA:

- ranking lexical
- heuristica por topicos
- TF-IDF simples
- prioridade por resumo/digest
- truncagem por limite

### Resultado

O modelo principal recebe apenas o melhor contexto, e nao o documento inteiro.

## Workstream 8: Cost Guard Real

### Objetivo

Controlar o gasto em tempo real.

### Arquivo

- `src/lib/ai/cost-guard.ts`

### O que adicionar

- budget diario por sistema
- budget diario por usuario
- budget por fonte
- downgrade automatico de modelo
- bloqueio ou degradacao quando o teto for atingido

### Exemplo de comportamento

- se custo diario atingir o limite operacional:
  - novas runs mudam de `gpt-5-mini` para `gpt-4o-mini`
  - se continuar acima do limite, entram em fila degradada
  - se necessario, pausar geracoes nao premium

## Workstream 9: Persistencia de Uso

### Objetivo

Sem persistir tokens e custo por run, nao ha controle economico de verdade.

### Campos recomendados em `runs`

- `provider`
- `model_used`
- `input_tokens`
- `output_tokens`
- `cached_tokens`
- `estimated_cost_usd`
- `source_digest_version`

### Uso futuro

Esses dados vao alimentar:

- dashboards
- alertas
- limites de usuario
- comparacao entre modelos

## Workstream 10: Benchmark de Qualidade

### Objetivo

Validar se o modelo barato entrega qualidade suficiente.

### Dataset recomendado

Separar `30-50` fontes reais e comparar:

- `gpt-4o-mini`
- `gpt-5-mini`

### Avaliacao humana

Medir:

- fidelidade ao material
- clareza
- utilidade de estudo
- duplicacao
- alucinacao
- cobertura

### Regra de decisao

- se `gpt-4o-mini` for bom o suficiente, ele vira padrao
- se falhar em materiais complexos, usar `gpt-5-mini` so nesses casos

## Rollout Recomendado

### Fase A

- adicionar router OpenAI
- sem ativar por padrao

### Fase B

- ativar para `5%` das runs de flashcards
- medir por alguns dias

### Fase C

- subir para `25%`
- validar custo, cache hit, qualidade

### Fase D

- subir para `50%`

### Fase E

- migrar `100%` se custo e qualidade estiverem dentro da meta

## Fases de Implementacao

## Fase 1

### Escopo

- provider abstraction
- client OpenAI
- persistencia de tokens e custo
- feature flag para escolher modelo/provedor

### Entrega

Ao final desta fase, o sistema consegue chamar OpenAI com observabilidade completa.

## Fase 2

### Escopo

- source digest
- policy de prompt enxuta
- schema curto de flashcards

### Entrega

Ao final desta fase, cada run passa a usar muito menos contexto.

## Fase 3

### Escopo

- prompt caching bem estruturado
- downgrade automatico de modelo
- budget diario

### Entrega

Ao final desta fase, o custo passa a ser controlado operacionalmente.

## Fase 4

### Escopo

- benchmark de qualidade
- rollout progressivo
- testes reais em carga

### Entrega

Ao final desta fase, a migracao pode ser considerada pronta para producao.

## Testes Reais Recomendados

Depois da migracao minima:

- `10`
- `25`
- `50`
- `100`

Medir em cada etapa:

- tempo total
- concluido
- erro
- retry
- p95 de tempo
- input tokens medios
- output tokens medios
- cached tokens
- custo medio por run
- custo total do lote

## Critrios de Aceite

O fluxo so deve ser considerado aprovado se cumprir:

- custo medio por run dentro da meta
- qualidade aprovada em benchmark humano
- retries controlados
- sem estouro frequente de rate limit
- throughput suficiente para a carga alvo
- telemetria completa por run

## Recomendacao Final

Para o caso atual, a estrategia mais segura e:

- `gpt-4o-mini` como padrao para flashcards
- `gpt-5-mini` como fallback de qualidade
- `source_digest` obrigatorio para reduzir custo recorrente
- prompt caching habilitado por estrutura de prompt correta
- fila e limite de concorrencia mantidos
- custo por run persistido e monitorado

Sem `source_digest` e sem reducao forte de prompt, a migracao de provedor melhora o limite operacional, mas nao resolve o risco de credito.

Com `source_digest + budget curto + caching + modelo barato`, a OpenAI passa a ser uma opcao viavel para escalar o produto sem destravar um custo descontrolado.
