# Admin security with Supabase

O admin nao usa mais uma senha administrativa paralela no painel. O acesso passa por:

1. Login Supabase.
2. Role `admin` no JWT: `auth.users.raw_app_meta_data.app_role = 'admin'`.
3. Role `admin` no banco: `profiles.app_role = 'admin'`.
4. MFA TOTP obrigatorio com AAL2.

## Configuracoes obrigatorias no Supabase

No painel do Supabase Auth:

- Access token expiry: `900` segundos.
- Refresh token rotation: habilitado.
- Reuse interval: manter curto.
- TOTP MFA: habilitado.

O Supabase Auth continua responsavel por hash de senha, refresh token e rotacao. Nao implemente bcrypt/JWT manual no app.

## Promover admin

Atualize `profiles.app_role` para `admin`. A migration `20260514_02_admin_jwt_claim_sync.sql` sincroniza esse role para `auth.users.raw_app_meta_data.app_role`.

Depois de promover, o usuario precisa sair e entrar novamente para receber um JWT novo com a claim `app_role=admin`.

Para criar ou atualizar o admin definido no `.env`, rode:

```bash
npm run admin:bootstrap
```

O script usa `ADMIN_EMAILS`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` para criar/atualizar o usuario no Supabase Auth, confirmar o email e marcar `app_role = 'admin'`. A senha do `.env` nao autentica diretamente o admin no runtime; ela serve para provisionar a conta real no Supabase.

## Login

O formulario de login usa `/api/auth/login`, nao `signInWithPassword` direto no client:

- CSRF token por cookie httpOnly + header.
- Rate limit de 5 tentativas por 15 minutos.
- Lockout por IP + email depois de 5 falhas.

OAuth continua usando o fluxo do Supabase no client.
