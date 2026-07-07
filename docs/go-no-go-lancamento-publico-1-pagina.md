# Go/No-Go de 1 Pagina - Lancamento Publico

Data de referencia: 26 de junho de 2026

## Decisao recomendada hoje

Decisao atual: `GO` para preparar o deploy candidato `1.0.0`; `NO-GO` para abrir trafego pago amplo antes do preflight remoto e da evidencia Stripe passarem.

Decisao alternativa: `GO` para beta publico controlado, com volume limitado de usuarios e monitoramento manual, depois do deploy do candidato `1.0.0`.

## Motivo da decisao

O produto esta tecnicamente maduro o suficiente para um candidato de release:

- `npm run lint:ci` passou
- `npm run test` passou
- `npm run build` passou
- `npm run public-launch:preflight` existe e bloqueia configuracoes incompletas antes da validacao Stripe

O bloqueio principal nao esta mais na compilacao local. O bloqueio restante esta na validacao do ambiente real e na readiness operacional/comercial.

## O que ja esta bom o suficiente

- App compila e builda para producao.
- Suite local de testes esta verde.
- Fluxos principais de billing possuem cobertura automatizada.
- Rotas sensiveis ja tem endurecimento relevante de seguranca.
- Pipeline principal do produto esta funcional.

## Blockers de No-Go

Enquanto QUALQUER item abaixo estiver em aberto, a recomendacao permanece `NO-GO` para abertura ampla:

1. Migration pendente nao aplicada e validada no banco do deploy.
2. Stripe real nao validado em staging ponta a ponta com o pacote de evidencia de `docs/public-launch-billing-evidence.md` e `npm run stripe:staging:validate`:
   checkout, webhook assinado, confirmacao, status, portal, cancelamento e refund.
3. Variaveis de ambiente de producao nao conferidas no ambiente real. No ultimo preflight, `RUNS_PROCESS_INTERNAL_SECRET` ainda faltava no deploy remoto.
4. Crons e Redis nao validados no deploy. No ultimo preflight, `/api/cron/system-report` retornava `404`, indicando que o deploy remoto ainda nao continha a rota nova; o preflight agora reporta esse caso explicitamente como rota nao deployada.
5. Alertas operacionais e responsavel por incidente nao definidos.
6. `/termos` e `/privacidade` nao revisados para cobranca publica real.

## Criterio objetivo de GO

Pode virar `GO` para lancamento publico amplo quando TODOS os itens abaixo estiverem fechados:

1. Migration aplicada em staging e producao, com confirmacao no banco correto.
2. `checkout -> webhook -> confirmacao -> status Pro -> portal -> cancelamento -> refund` validado com Stripe real e pacote de evidencia arquivado.
3. `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `RUNS_PROCESS_INTERNAL_SECRET`, chaves Supabase, Stripe, IA e Redis conferidos no ambiente deployado.
4. Crons funcionando via QStash no deploy e Redis acessivel.
5. Checagens de seguranca pos-deploy confirmadas:
   admin protegido, `app_events` sem insert anonimo, checkout com origins permitidas, `/api/runs/process` protegido.
6. Canal de alertas ativo e alguem responsavel por responder incidentes.
7. Textos juridicos finais aprovados.

## Regra pratica de lancamento

- Se a meta for aprender com usuarios reais sem grande risco financeiro: `GO` para beta controlado.
- Se a meta for trafego aberto, cobranca publica e escala sem acompanhamento manual: `NO-GO` ate fechar os blockers acima.

## Recomendacao executiva

Melhor decisao hoje:

- liberar para beta controlado imediatamente, se quiser feedback real rapido;
- nao abrir ainda como lancamento publico amplo pago;
- fechar os blockers operacionais e de ambiente antes do go-live geral.
