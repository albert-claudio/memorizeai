# Deploy dos Cron Endpoints via QStash

Este documento descreve o que precisa ser feito para colocar os endpoints de cron do Vimens para rodar com QStash em producao, com validacao de assinatura e sem depender mais do `vercel.json`.

## O que mudou no codigo

Os endpoints abaixo continuam existindo e continuam com metodo `GET`:

- `/api/cron/recover-runs`
- `/api/cron/health-check`
- `/api/cron/alerts`
- `/api/cron/system-report`

Agora eles aceitam:

- assinatura valida do QStash via `Upstash-Signature`
- fallback temporario com `CRON_SECRET`

O fallback existe apenas para evitar janela de indisponibilidade durante o cutover. Depois que os schedules do QStash estiverem funcionando, remova `CRON_SECRET` do ambiente.

## Arquivos relevantes

- [src/lib/security/cron-auth.ts](C:/Users/Albert/Documents/memorizeai/src/lib/security/cron-auth.ts)
- [src/app/api/cron/recover-runs/route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/cron/recover-runs/route.ts)
- [src/app/api/cron/health-check/route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/cron/health-check/route.ts)
- [src/app/api/cron/alerts/route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/cron/alerts/route.ts)
- [src/app/api/cron/system-report/route.ts](C:/Users/Albert/Documents/memorizeai/src/app/api/cron/system-report/route.ts)

## Pre-requisitos

Antes de criar os schedules:

1. O deploy que contem a migracao para QStash precisa estar em producao.
2. A URL publica canonica do app precisa estar definida e funcionando.
3. Os endpoints `/api/cron/*` precisam estar acessiveis publicamente.
4. `RUNS_PROCESS_INTERNAL_SECRET` precisa continuar configurado, porque o `recover-runs` usa `/api/runs/process`.

## Variaveis de ambiente

Configure no ambiente de producao:

- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `RUNS_PROCESS_INTERNAL_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `WEBHOOK_ALERT_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Durante o cutover, mantenha tambem:

- `CRON_SECRET`

Depois que o QStash estiver validado:

- remova `CRON_SECRET`

## Onde pegar as signing keys

No console do QStash:

1. Abra o projeto no Upstash QStash.
2. Va para a area de signing keys.
3. Copie a chave `current`.
4. Copie a chave `next`.
5. Salve essas chaves no deploy como `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY`.

Sem essas chaves, o app responde `500` por configuracao incompleta ou `401/403` para requests nao assinados.

## URL correta dos endpoints

Use sempre a URL publica definitiva do app.

Exemplo:

```text
https://www.vimens.com.br/api/cron/recover-runs
https://www.vimens.com.br/api/cron/health-check
https://www.vimens.com.br/api/cron/alerts
https://www.vimens.com.br/api/cron/system-report
```

Nao aponte para:

- preview URL
- dominio temporario de branch
- localhost

A verificacao usa a URL do request. Se o schedule chamar uma URL diferente da URL publica esperada do deploy, a assinatura pode falhar.

## Schedules que precisam existir

Crie estes 4 schedules no QStash:

| Endpoint | Metodo | Cron | Objetivo |
| --- | --- | --- | --- |
| `/api/cron/recover-runs` | `GET` | `*/5 * * * *` | Recuperar runs travadas |
| `/api/cron/health-check` | `GET` | `*/10 * * * *` | Verificar Supabase e Redis |
| `/api/cron/alerts` | `GET` | `*/30 * * * *` | Consolidar alertas operacionais |
| `/api/cron/system-report` | `GET` | `0 11 * * *` | Enviar relatorio diario de saude pelo Telegram |

Observacoes:

- O QStash usa `POST` por padrao. Aqui voce precisa trocar para `GET`.
- Cron do QStash e avaliado em `UTC` por padrao.
- Esses cron expressions mantem o comportamento atual. Nao precisam de timezone extra.
- O primeiro disparo pode demorar ate cerca de 60 segundos para entrar em um node ativo do QStash.

## Como criar no dashboard do QStash

Para cada endpoint:

1. Abra a tela de schedules no QStash.
2. Clique para criar um novo schedule.
3. Informe a URL completa do endpoint.
4. Configure o metodo HTTP como `GET`.
5. Informe o cron expression correspondente.
6. Nao envie body.
7. Salve o schedule.

Repita para os 4 endpoints.

Se o dashboard pedir headers opcionais, nao e necessario adicionar `Authorization`, porque a autenticacao agora e feita pela assinatura do QStash.

## Alternativa via API/cURL

Se preferir criar por API, use o token do QStash e passe `Upstash-Method: GET`.

Exemplo para `recover-runs`:

```bash
curl --request POST \
  --url "https://qstash.upstash.io/v2/schedules/https://www.vimens.com.br/api/cron/recover-runs" \
  --header "Authorization: Bearer <QSTASH_TOKEN>" \
  --header "Upstash-Cron: */5 * * * *" \
  --header "Upstash-Method: GET"
```

Exemplo para `health-check`:

```bash
curl --request POST \
  --url "https://qstash.upstash.io/v2/schedules/https://www.vimens.com.br/api/cron/health-check" \
  --header "Authorization: Bearer <QSTASH_TOKEN>" \
  --header "Upstash-Cron: */10 * * * *" \
  --header "Upstash-Method: GET"
```

Exemplo para `alerts`:

```bash
curl --request POST \
  --url "https://qstash.upstash.io/v2/schedules/https://www.vimens.com.br/api/cron/alerts" \
  --header "Authorization: Bearer <QSTASH_TOKEN>" \
  --header "Upstash-Cron: */30 * * * *" \
  --header "Upstash-Method: GET"
```

Exemplo para `system-report`:

```bash
curl --request POST \
  --url "https://qstash.upstash.io/v2/schedules/https://www.vimens.com.br/api/cron/system-report" \
  --header "Authorization: Bearer <QSTASH_TOKEN>" \
  --header "Upstash-Cron: 0 11 * * *" \
  --header "Upstash-Method: GET"
```

## Ordem segura de cutover

Para evitar quebrar producao:

1. Faça deploy do codigo novo com suporte a QStash.
2. Confirme que `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` estao configuradas.
3. Mantenha `CRON_SECRET` no ambiente nessa etapa.
4. Crie os 4 schedules no QStash.
5. Espere a primeira execucao automatica de cada um.
6. Valide logs e respostas.
7. Quando tudo estiver verde, remova `CRON_SECRET`.

Essa ordem garante que:

- requests do QStash passem por assinatura
- qualquer execucao antiga ainda autorizada por `CRON_SECRET` nao quebre no meio da transicao

## Checklist de validacao apos criar os schedules

Valide estes pontos no deploy:

1. `recover-runs` responde `200` em execucao automatica do QStash.
2. `health-check` responde `200` quando Supabase e Redis estao saudaveis.
3. `alerts` responde `200`, mesmo quando nao houver alertas.
4. `system-report` responde `200`; no JSON, `delivered=true` confirma envio ao Telegram.
5. Nenhum dos 4 endpoints retorna `401`.
6. Nenhum dos 4 endpoints retorna `403`.
7. Os logs nao mostram `Invalid QStash signature`.
8. O `health-check` continua reportando Redis e Supabase corretamente.
9. O `recover-runs` continua conseguindo chamar `/api/runs/process`.

## Como testar sem esperar a janela do cron

A forma mais segura e disparar manualmente a partir do proprio QStash:

1. Abra o schedule no console.
2. Use a opcao de trigger manual, replay ou publish imediato, se disponivel no painel.
3. Verifique os logs do endpoint no deploy.

Se preferir testar por API, publique uma mensagem unica para o mesmo endpoint com metodo `GET`.

Nao use `curl` direto no endpoint publico para validar sucesso funcional, porque a request sem assinatura deve ser rejeitada.

## Como interpretar falhas

`401 Unauthorized`

- request chegou sem assinatura valida e sem fallback legado
- ou faltou `CRON_SECRET` durante o periodo de transicao

`403 Invalid QStash signature`

- URL configurada no QStash nao bate com a URL real chamada
- signing keys erradas no ambiente
- schedule apontando para deploy/host diferente

`500 Cron auth is misconfigured`

- `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` nao estao configuradas
- e tambem nao existe `CRON_SECRET`

`500 Server misconfigured` em `recover-runs`

- faltou `RUNS_PROCESS_INTERNAL_SECRET`

`system-report` com `delivered=false`

- o endpoint autenticou e gerou o relatorio, mas o envio ao Telegram falhou
- confira `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e a resposta `telegram.error`
- QStash deve receber `200`; corrija a entrega pelo erro reportado no JSON/logs

## Rollback

Se algo der errado no cutover:

1. Pause ou apague os schedules no QStash.
2. Garanta que `CRON_SECRET` continua definido.
3. Se necessario, faca rollback do deploy para a versao anterior.

Como o `vercel.json` foi removido do repositorio, rollback para Vercel Cron depende de voltar para um commit anterior que ainda contenha esse arquivo.

## Estado final esperado

Quando estiver tudo certo em producao:

- os 4 schedules existem no QStash
- o schedule de relatorio diario existe no QStash
- todos usam `GET`
- todos apontam para a URL publica canonica
- `QSTASH_CURRENT_SIGNING_KEY` e `QSTASH_NEXT_SIGNING_KEY` estao configuradas
- `CRON_SECRET` foi removido
- os logs mostram execucoes normais sem erro de assinatura

## Referencias oficiais

- Verificacao de assinatura: [Upstash QStash Verify Signatures](https://upstash.com/docs/qstash/howto/signature)
- Schedules: [Upstash QStash Schedules](https://upstash.com/docs/qstash/features/schedules)
- Exemplos de schedules: [Upstash QStash Schedules Examples](https://upstash.com/docs/qstash/sdks/ts/examples/schedules)
- Rotacao de signing keys: [Upstash Roll Your Signing Keys](https://upstash.com/docs/qstash/howto/roll-signing-keys)
