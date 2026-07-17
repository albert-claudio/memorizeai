# Corte para pagamentos em produção

Este procedimento ativa pagamentos reais somente depois de a conta Stripe estar verificada.

## Configuração na Stripe (modo live)

1. Conclua a verificação de e-mail, empresa e conta bancária.
2. Crie o produto **Vimens Pro** e um preço recorrente mensal em BRL. O valor deve ser a decisão comercial aprovada; o aplicativo não aceita preço enviado pelo navegador.
3. Configure o Customer Portal para permitir cancelamento da assinatura e atualização do método de pagamento.
4. Crie o endpoint `https://www.vimens.com.br/api/stripe/webhook` com estes eventos:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Copie apenas o segredo de assinatura desse endpoint para `STRIPE_WEBHOOK_SECRET` no ambiente Production do provedor de deploy.

## Variáveis de produção

Defina, exclusivamente no ambiente Production:

- `STRIPE_SECRET_KEY` — chave live (`sk_live_` ou `rk_live_`);
- `STRIPE_WEBHOOK_SECRET` — segredo `whsec_` do endpoint live;
- `STRIPE_PRO_PRICE_ID` — preço mensal live criado acima;
- `NEXT_PUBLIC_APP_URL=https://www.vimens.com.br`;
- `ALLOWED_APP_ORIGINS=https://www.vimens.com.br,https://vimens.com.br`.

Mantenha `BILLING_E2E_ENABLED`, `BILLING_CHECKOUT_E2E_ENABLED` e `BILLING_APP_ROUTE_E2E_ENABLED` como `false` em produção.

## Validação antes do deploy

Com as variáveis live disponíveis apenas no ambiente controlado, execute:

```powershell
npm run stripe:production:preflight
```

O comando é somente de leitura: confere URL pública, chave live, preço mensal ativo, endpoint de webhook, eventos obrigatórios, portal ativo e se as rotas de teste estão desligadas. Ele não cria clientes, assinaturas, pagamentos nem reembolsos.
