import fs from 'node:fs';
import path from 'node:path';

process.on('uncaughtException', error => {
  console.error(`OAB blind test error: ${error.message}`);
  process.exit(1);
});

const root = process.cwd();
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value] = arg.split('=');
  return [key.replace(/^--/, ''), value ?? 'true'];
}));

const realPath = path.resolve(root, args.get('real') ?? 'eval/real_questions.json');
const generatedPath = path.resolve(root, args.get('generated') ?? 'eval/generated_questions.json');
const evaluatorPath = path.resolve(root, args.get('evaluator') ?? 'eval/PARA-AVALIADOR.csv');
const answerKeyPath = path.resolve(root, args.get('answer-key') ?? 'eval/COM-GABARITO.csv');
const seed = args.get('seed') ?? 'oab-fgv-validation';
const allowPlaceholders = args.get('allow-placeholder') === 'true';

function readJsonArray(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${label} must be a non-empty JSON array`);
  }
  return parsed;
}

function normalizeAlternativas(item) {
  if (Array.isArray(item.alternativas)) return item.alternativas;
  if (item.alternativas && typeof item.alternativas === 'object') {
    return ['A', 'B', 'C', 'D', 'E']
      .map(letter => item.alternativas[letter] ? `${letter}) ${item.alternativas[letter]}` : null)
      .filter(Boolean);
  }
  return [];
}

function validate(item, label, index) {
  if (!item?.id) throw new Error(`${label}[${index}].id is required`);
  if (!item?.enunciado) throw new Error(`${label}[${index}].enunciado is required`);
  if (normalizeAlternativas(item).length < 4) throw new Error(`${label}[${index}].alternativas must have at least 4 options`);
  if (!/^[A-E]$/.test(String(item.respostaCorreta ?? '').trim())) {
    throw new Error(`${label}[${index}].respostaCorreta must be A, B, C, D, or E`);
  }
  if (!allowPlaceholders) {
    const combined = [
      item.area,
      item.enunciado,
      ...normalizeAlternativas(item),
      item.comentario,
    ].filter(Boolean).join('\n');
    if (/substitua|cole aqui|preencher_area|alternativa gerada/i.test(combined)) {
      throw new Error(`${label}[${index}] contains placeholder text`);
    }
  }
}

function hashSeed(text) {
  let h = 2166136261;
  for (const char of text) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRandom(seedText) {
  let state = hashSeed(seedText) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296);
  };
}

function shuffle(items, seedText) {
  const random = createRandom(seedText);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`,
  );
}

const real = readJsonArray(realPath, 'real_questions').map(item => ({ ...item, origem: 'real' }));
const generated = readJsonArray(generatedPath, 'generated_questions').map(item => ({ ...item, origem: 'gerada' }));
real.forEach((item, index) => validate(item, 'real_questions', index));
generated.forEach((item, index) => validate(item, 'generated_questions', index));

const mixed = shuffle([...real, ...generated], seed);
const evaluatorRows = [[
  'id_anonimo',
  'enunciado',
  'alternativas',
  'palpite_origem',
  'nota_estilo_oab_0_10',
  'motivo_reprovacao',
  'observacoes',
]];
const answerRows = [[
  'id_anonimo',
  'origem',
  'id_original',
  'gabarito',
  'exam',
  'area',
  'sourceUrl',
]];

mixed.forEach((item, index) => {
  const anonymousId = `Q${String(index + 1).padStart(3, '0')}`;
  evaluatorRows.push([
    anonymousId,
    item.enunciado,
    normalizeAlternativas(item).join('\n'),
    '',
    '',
    '',
    '',
  ]);
  answerRows.push([
    anonymousId,
    item.origem,
    item.id,
    item.respostaCorreta,
    item.exam ?? '',
    item.area ?? '',
    item.sourceUrl ?? '',
  ]);
});

writeCsv(evaluatorPath, evaluatorRows);
writeCsv(answerKeyPath, answerRows);
console.log(`Blind test files written: ${path.relative(root, evaluatorPath)}, ${path.relative(root, answerKeyPath)}`);
