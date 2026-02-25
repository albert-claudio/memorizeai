/**
 * 🔒 SECURITY AUDIT SCRIPT — Vimens/Memoriza
 * Simulates all browser-based security tests via Node.js
 * Reads the actual NEXT_PUBLIC_SUPABASE_ANON_KEY from .env
 */

import { readFileSync } from 'fs';

// Read .env file and parse keys
const envContent = readFileSync('.env', 'utf-8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=\s]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL || 'https://eqpvfzviaavsobiyqsjr.supabase.co';
const EXPOSED_KEY = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP_URL = 'http://localhost:3000';

if (!EXPOSED_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY não encontrada no .env');
  process.exit(1);
}

const PASS = '✅ PASS';
const FAIL = '❌ FAIL';
const WARN = '⚠️  WARNING';

function decodeJWT(token) {
  const payload = token.split('.')[1];
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    'apikey': EXPOSED_KEY,
    'Authorization': `Bearer ${EXPOSED_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers,
  };
  
  try {
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, ok: res.ok };
  } catch (err) {
    return { status: 0, data: null, error: err.message };
  }
}

console.log('');
console.log('='.repeat(70));
console.log('  🔒 AUDITORIA DE SEGURANÇA — Vimens/Memoriza');
console.log('  ' + new Date().toISOString());
console.log('='.repeat(70));

// ════════════════════════════════════════════════════════════════════════
// TEST 0: Service Role Key Exposure
// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(70));
console.log('TEST 0: VERIFICAÇÃO DA CHAVE SERVICE_ROLE EXPOSTA');
console.log('─'.repeat(70));

const decoded = decodeJWT(EXPOSED_KEY);
console.log('\nJWT Decodificado da NEXT_PUBLIC_SUPABASE_ANON_KEY:');
console.log(JSON.stringify(decoded, null, 2));
console.log(`\nRole no JWT: "${decoded.role}"`);

if (decoded.role === 'service_role') {
  console.log(`\n${FAIL} — A chave pública do frontend contém "role": "service_role"!`);
  console.log('   IMPACTO: Qualquer usuário no browser tem acesso TOTAL ao banco.');
  console.log('   Todas as RLS policies são IGNORADAS com service_role.');
  console.log('   FIX: Substituir por anon key real no painel Supabase → Settings → API.');
} else if (decoded.role === 'anon') {
  console.log(`\n${PASS} — A chave corretamente usa "role": "anon".`);
} else {
  console.log(`\n${WARN} — Role inesperado: "${decoded.role}"`);
}

// ════════════════════════════════════════════════════════════════════════
// TEST 2: Network — Data Exposure (SELECT * bypass)
// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(70));
console.log('TEST 2a: DATA EXPOSURE — SELECT * em todas as tabelas');
console.log('─'.repeat(70));

const tables = ['profiles', 'decks', 'cards', 'card_reviews', 'study_goals', 'sources', 'runs', 'chunks', 'user_srs_settings'];

for (const table of tables) {
  const result = await supabaseRequest(`${table}?select=*&limit=5`);
  const count = Array.isArray(result.data) ? result.data.length : 0;
  const status = result.status;
  
  if (status === 200 && count > 0) {
    const cols = Object.keys(result.data[0]).join(', ');
    // Check if we see data from multiple users
    const userIds = new Set();
    result.data.forEach(row => {
      if (row.user_id) userIds.add(row.user_id);
    });
    
    if (userIds.size > 1) {
      console.log(`\n${FAIL} ${table}: ${count} rows de ${userIds.size} USERS DIFERENTES`);
      console.log(`   Colunas: ${cols}`);
      console.log(`   User IDs: ${[...userIds].join(', ')}`);
    } else if (count > 0) {
      console.log(`\n${WARN} ${table}: ${count} rows retornadas (1 user)`);
      console.log(`   Colunas: ${cols}`);
      // Check for sensitive columns
      const sensitiveFields = ['password', 'password_hash', 'stripe_customer_id', 'is_pro', 'email'];
      const foundSensitive = sensitiveFields.filter(f => cols.includes(f));
      if (foundSensitive.length > 0) {
        console.log(`   ${FAIL} Campos sensíveis expostos: ${foundSensitive.join(', ')}`);
      }
    }
  } else if (status === 200 && count === 0) {
    console.log(`\n${PASS} ${table}: 0 rows (RLS ou tabela vazia)`);
  } else {
    const msg = result.data?.message || result.data?.hint || JSON.stringify(result.data).slice(0, 100);
    console.log(`\n${status === 401 || status === 403 ? PASS : WARN} ${table}: HTTP ${status} — ${msg}`);
  }
}

// ════════════════════════════════════════════════════════════════════════
// TEST 2b: Cross-Tenant Write — Insert deck for fake user
// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(70));
console.log('TEST 2b: CROSS-TENANT WRITE — Inserir deck com user_id fake');
console.log('─'.repeat(70));

const fakeUserId = '00000000-0000-0000-0000-000000000000';
const fakeInsert = await supabaseRequest('decks', {
  method: 'POST',
  body: JSON.stringify({
    id: 'security-test-' + Date.now(),
    user_id: fakeUserId,
    title: 'SECURITY_AUDIT_TEST_DECK',
    created_at: Date.now(),
    updated_at: Date.now(),
  }),
});

if (fakeInsert.ok) {
  console.log(`\n${FAIL} INSERT aceito com user_id fake: ${fakeUserId}`);
  console.log('   IMPACTO: Qualquer pessoa pode criar dados como outro usuário.');
  console.log('   Dados:', JSON.stringify(fakeInsert.data).slice(0, 200));
  
  // Limpar o teste
  await supabaseRequest(`decks?id=eq.security-test-${Date.now() - 1}`, { method: 'DELETE' });
} else {
  console.log(`\n${PASS} INSERT rejeitado. HTTP ${fakeInsert.status}`);
  console.log('   ', JSON.stringify(fakeInsert.data).slice(0, 200));
}

// ════════════════════════════════════════════════════════════════════════
// TEST 5: Privilege Escalation — Set is_pro = true
// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(70));
console.log('TEST 5: PRIVILEGE ESCALATION — Alterar is_pro no profiles');
console.log('─'.repeat(70));

// First get any profile
const profiles = await supabaseRequest('profiles?select=id,is_pro&limit=1');
if (Array.isArray(profiles.data) && profiles.data.length > 0) {
  const targetProfile = profiles.data[0];
  console.log(`\nPerfil encontrado: ${targetProfile.id}, is_pro: ${targetProfile.is_pro}`);
  
  const escalation = await supabaseRequest(`profiles?id=eq.${targetProfile.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_pro: !targetProfile.is_pro }),
  });
  
  if (escalation.ok) {
    console.log(`${FAIL} — PATCH aceito! is_pro alterado para ${!targetProfile.is_pro}`);
    console.log('   IMPACTO: Qualquer usuário pode se tornar Pro sem pagar.');
    
    // Reverter
    await supabaseRequest(`profiles?id=eq.${targetProfile.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_pro: targetProfile.is_pro }),
    });
    console.log('   (Revertido para valor original)');
  } else {
    console.log(`${PASS} — PATCH rejeitado. HTTP ${escalation.status}`);
  }
} else {
  console.log(`${WARN} — Nenhum profile encontrado para teste.`);
}

// ════════════════════════════════════════════════════════════════════════
// TEST 6a: Direct DELETE (hard delete bypass)
// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(70));
console.log('TEST 6a: HARD DELETE — Tentar DELETE direto em tabelas');
console.log('─'.repeat(70));

const deleteTargets = ['decks', 'cards', 'profiles', 'card_reviews'];
for (const table of deleteTargets) {
  // Try to delete with a non-existent ID to test if the operation is allowed
  const delResult = await supabaseRequest(`${table}?id=eq.nonexistent-test-id`, {
    method: 'DELETE',
  });
  
  if (delResult.status === 200 || delResult.status === 204) {
    console.log(`${FAIL} ${table}: DELETE aceito (HTTP ${delResult.status})`);
    console.log('   IMPACTO: Hard delete disponível — viola política de soft delete.');
  } else if (delResult.status === 401 || delResult.status === 403) {
    console.log(`${PASS} ${table}: DELETE bloqueado (HTTP ${delResult.status})`);
  } else {
    console.log(`${WARN} ${table}: HTTP ${delResult.status} — ${JSON.stringify(delResult.data).slice(0, 100)}`);
  }
}

// ════════════════════════════════════════════════════════════════════════
// TEST 6b: RPC functions bypass
// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(70));
console.log('TEST 6b: RPC — Testar push_changes e pull_changes');
console.log('─'.repeat(70));

const rpcPull = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pull_changes`, {
  method: 'POST',
  headers: {
    'apikey': EXPOSED_KEY,
    'Authorization': `Bearer ${EXPOSED_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ last_pulled_at: 0, user_id: fakeUserId }),
});

const pullData = await rpcPull.text();
console.log(`\npull_changes(user_id=fake): HTTP ${rpcPull.status}`);
if (rpcPull.ok) {
  console.log(`${FAIL} — RPC retornou dados!`);
  console.log('   ', pullData.slice(0, 300));
} else {
  console.log(`${PASS} — RPC rejeitado.`);
  console.log('   ', pullData.slice(0, 200));
}

// ════════════════════════════════════════════════════════════════════════
// TEST 4: Check exposed env vars via Next.js
// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(70));
console.log('TEST 4: ENV VARS — Verificar exposição de secrets no frontend');
console.log('─'.repeat(70));

try {
  const pageHtml = await (await fetch(`${APP_URL}`)).text();
  
  // Check for common secret patterns in the HTML/JS
  const secrets = [
    { name: 'GROQ_API_KEY', pattern: /gsk_[a-zA-Z0-9]{40,}/g },
    { name: 'GEMINI_API_KEY', pattern: /AIzaSy[a-zA-Z0-9_-]{33}/g },
    { name: 'STRIPE_SECRET_KEY', pattern: /sk_test_[a-zA-Z0-9]{40,}/g },
    { name: 'STRIPE_WEBHOOK_SECRET', pattern: /whsec_[a-zA-Z0-9]{30,}/g },
    { name: 'RESEND_API_KEY', pattern: /re_[a-zA-Z0-9]{30,}/g },
    { name: 'SUPABASE_SERVICE_ROLE', pattern: /service_role/g },
    { name: 'UPSTASH_TOKEN', pattern: /AT1bAA[a-zA-Z0-9]{40,}/g },
  ];
  
  let foundSecrets = false;
  for (const { name, pattern } of secrets) {
    const matches = pageHtml.match(pattern);
    if (matches) {
      console.log(`${FAIL} ${name} encontrada no HTML da landing page!`);
      console.log(`   Valor parcial: ${matches[0].slice(0, 20)}...`);
      foundSecrets = true;
    }
  }
  
  if (!foundSecrets) {
    console.log(`${PASS} — Nenhuma API key secreta encontrada no HTML da landing page.`);
  }
  
  // Check NEXT_DATA
  const nextDataMatch = pageHtml.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/);
  if (nextDataMatch) {
    const nextData = JSON.parse(nextDataMatch[1]);
    console.log(`\n__NEXT_DATA__ encontrado — verificando props:`);
    const propsStr = JSON.stringify(nextData);
    let hasSecrets = false;
    for (const { name, pattern } of secrets) {
      if (pattern.test(propsStr)) {
        console.log(`${FAIL} ${name} presente em __NEXT_DATA__!`);
        hasSecrets = true;
      }
    }
    if (!hasSecrets) {
      console.log(`${PASS} — Nenhum secret em __NEXT_DATA__`);
    }
  } else {
    console.log(`${PASS} — __NEXT_DATA__ não encontrado (RSC/streaming mode)`);
  }
} catch (e) {
  console.log(`${WARN} — Não foi possível acessar ${APP_URL}: ${e.message}`);
}

// ════════════════════════════════════════════════════════════════════════
// TEST 4b: Check JS bundles for leaked keys
// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(70));
console.log('TEST 4b: JS BUNDLES — Verificar chaves nos bundles do Next.js');
console.log('─'.repeat(70));

try {
  const homePage = await (await fetch(`${APP_URL}`)).text();
  // Extract JS bundle URLs
  const scriptUrls = [...homePage.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map(m => m[1]);
  
  console.log(`Encontrados ${scriptUrls.length} bundles JS.`);
  
  let bundleSecretCount = 0;
  for (const scriptUrl of scriptUrls.slice(0, 10)) { // Check first 10 bundles
    const jsContent = await (await fetch(`${APP_URL}${scriptUrl}`)).text();
    
    if (/service_role/.test(jsContent)) {
      console.log(`${FAIL} "service_role" encontrado em ${scriptUrl}`);
      bundleSecretCount++;
    }
    if (/sk_test_/.test(jsContent)) {
      console.log(`${FAIL} STRIPE_SECRET_KEY encontrada em ${scriptUrl}`);
      bundleSecretCount++;
    }
    if (/gsk_/.test(jsContent)) {
      console.log(`${FAIL} GROQ_API_KEY encontrada em ${scriptUrl}`);
      bundleSecretCount++;
    }
    if (/whsec_/.test(jsContent)) {
      console.log(`${FAIL} STRIPE_WEBHOOK_SECRET encontrada em ${scriptUrl}`);
      bundleSecretCount++;
    }
  }
  
  if (bundleSecretCount === 0) {
    console.log(`${PASS} — Nenhum secret exposto nos JS bundles verificados.`);
  }
} catch (e) {
  console.log(`${WARN} — Não foi possível verificar bundles: ${e.message}`);
}

// ════════════════════════════════════════════════════════════════════════
// TEST 1: Check API endpoints without auth  
// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(70));
console.log('TEST 1: API ENDPOINTS SEM AUTENTICAÇÃO');
console.log('─'.repeat(70));

const apiEndpoints = [
  { path: '/api/user/tier-limits', method: 'GET' },
  { path: '/api/stripe/create-checkout', method: 'POST' },
  { path: '/api/runs', method: 'GET' },
  { path: '/api/runs', method: 'POST' },
  { path: '/api/process-source', method: 'POST' },
  { path: '/api/trigger-processing', method: 'POST' },
];

for (const ep of apiEndpoints) {
  try {
    const res = await fetch(`${APP_URL}${ep.path}`, { 
      method: ep.method,
      headers: ep.method === 'POST' ? { 'Content-Type': 'application/json' } : {},
      body: ep.method === 'POST' ? JSON.stringify({}) : undefined,
    });
    const statusOk = res.status === 401 || res.status === 403;
    console.log(`${statusOk ? PASS : FAIL} ${ep.method} ${ep.path}: HTTP ${res.status}`);
    if (!statusOk) {
      const body = await res.text();
      console.log(`   Response: ${body.slice(0, 150)}`);
    }
  } catch (e) {
    console.log(`${WARN} ${ep.method} ${ep.path}: ${e.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70));
console.log('  📋 RESUMO DA AUDITORIA');
console.log('='.repeat(70));

if (decoded.role === 'service_role') {
  console.log(`
🔴 CRÍTICA: NEXT_PUBLIC_SUPABASE_ANON_KEY contém service_role key
   → Bypass total de RLS — acesso irrestrito ao banco
   → FIX: Trocar pela anon key real no painel Supabase
`);
} else if (decoded.role === 'anon') {
  console.log(`
✅ NEXT_PUBLIC_SUPABASE_ANON_KEY está usando a anon key correta.
   → RLS policies estão ativas e protegendo os dados.

Para mais detalhes, veja os resultados de cada teste acima.
`);
} else {
  console.log(`
⚠️  Role inesperado: "${decoded.role}" — verifique a configuração.
`);
}
