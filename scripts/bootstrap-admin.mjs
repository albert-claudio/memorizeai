import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();

function loadEnvFile(fileName) {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variavel obrigatoria ausente: ${name}`);
  }
  return value;
}

function parseAdminEmails(value) {
  return value
    .split(/[,\s;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function findUserByEmail(supabase, email) {
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const found = users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function ensureProfileAdmin(supabase, userId) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, app_role: 'admin', updated_at: Date.now() }, { onConflict: 'id' });

  if (error) throw error;
}

async function main() {
  const url = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const password = requiredEnv('ADMIN_PASSWORD');
  const emails = parseAdminEmails(requiredEnv('ADMIN_EMAILS'));

  if (emails.length === 0) {
    throw new Error('ADMIN_EMAILS nao contem nenhum email valido.');
  }

  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD deve ter pelo menos 12 caracteres.');
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const email of emails) {
    const existing = await findUserByEmail(supabase, email);

    if (existing) {
      const appMetadata = { ...(existing.app_metadata ?? {}), app_role: 'admin' };
      const { error } = await supabase.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        app_metadata: appMetadata,
      });
      if (error) throw error;

      await ensureProfileAdmin(supabase, existing.id);
      console.log(`Admin atualizado: ${email}`);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { app_role: 'admin' },
    });
    if (error) throw error;
    if (!data.user) throw new Error(`Supabase nao retornou usuario para ${email}.`);

    await ensureProfileAdmin(supabase, data.user.id);
    console.log(`Admin criado: ${email}`);
  }

  console.log('Bootstrap admin concluido. Saia e entre novamente para atualizar o JWT.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
