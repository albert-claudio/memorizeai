# Private Beta Flow

Objetivo: liberar no maximo 30 pessoas para testar o produto por 30 dias, com acesso Pro temporario e dados reais de uso.

## Fluxo

1. Admin acessa `/admin`.
2. Em `Beta privado`, cadastra o email do convidado.
3. O sistema gera um codigo de 6 digitos, grava apenas o hash e envia o email via Resend.
4. O usuario cria conta ou faz login com o mesmo email convidado.
5. O usuario abre `/beta`, informa o codigo e ativa 30 dias de acesso.

## Variaveis

- `NEXT_RESEND_API_KEY`: obrigatoria para envio automatico do email.
- `NOTIFICATIONS_FROM_EMAIL`: remetente usado no email.
- `BETA_INVITE_CODE_SECRET`: segredo para hash dos codigos. Use pelo menos 24 caracteres.
- `BETA_INVITE_LIMIT`: padrao `30`.
- `BETA_TRIAL_DAYS`: padrao `30`.
- `BETA_CODE_TTL_DAYS`: padrao `14`.

## Banco

A migration `supabase/migrations/20260514_01_beta_invites.sql` cria a tabela `beta_invites` e bloqueia mais de 30 convites ativos. Convites revogados nao contam no limite.

Ao resgatar um codigo, o sistema:

- marca o convite como `redeemed`;
- atualiza `profiles` para `is_pro=true`, `subscription_status=active`, `subscription_tier=pro`;
- cria uma linha interna em `subscriptions` com `stripe_subscription_id=beta_trial_<inviteId>` e expira em 30 dias.

Essa decisao reaproveita o modelo de acesso Pro existente sem criar bypass permanente.
