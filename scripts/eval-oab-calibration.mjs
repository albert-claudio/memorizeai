import fs from 'node:fs';
import path from 'node:path';

process.on('uncaughtException', error => {
  console.error(`OAB calibration error: ${error.message}`);
  process.exit(1);
});

const root = process.cwd();
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value] = arg.split('=');
  return [key.replace(/^--/, ''), value ?? 'true'];
}));

const realPath = path.resolve(root, args.get('real') ?? 'eval/real_questions.json');
const generatedPath = path.resolve(root, args.get('generated') ?? 'eval/generated_questions.json');
const outPath = path.resolve(root, args.get('out') ?? 'eval/calibration-report.json');
const allowPlaceholders = args.get('allow-placeholder') === 'true';

function readJsonArray(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array`);
  }

  if (parsed.length === 0) {
    throw new Error(`${label} is empty`);
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

function validateQuestion(item, label, index) {
  const where = `${label}[${index}]`;
  if (!item || typeof item !== 'object') throw new Error(`${where} must be an object`);
  if (typeof item.id !== 'string' || item.id.trim() === '') throw new Error(`${where}.id is required`);
  if (typeof item.enunciado !== 'string' || item.enunciado.trim() === '') throw new Error(`${where}.enunciado is required`);
  if (typeof item.respostaCorreta !== 'string' || !/^[A-E]$/.test(item.respostaCorreta.trim())) {
    throw new Error(`${where}.respostaCorreta must be A, B, C, D, or E`);
  }

  const alternativas = normalizeAlternativas(item);
  if (alternativas.length < 4 || alternativas.length > 5) {
    throw new Error(`${where}.alternativas must have 4 or 5 options`);
  }

  if (!allowPlaceholders) {
    const combined = [
      item.area,
      item.enunciado,
      ...alternativas,
      item.comentario,
    ].filter(Boolean).join('\n');
    if (/substitua|cole aqui|preencher_area|alternativa gerada/i.test(combined)) {
      throw new Error(`${where} contains placeholder text`);
    }
  }
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate(values) {
  return mean(values.map(Boolean).map(value => value ? 1 : 0));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function optionTextForAnswer(alternativas, answer) {
  const option = alternativas.find(text => text.trim().startsWith(`${answer})`));
  return option ?? alternativas[['A', 'B', 'C', 'D', 'E'].indexOf(answer)] ?? '';
}

function features(item) {
  const alternativas = normalizeAlternativas(item);
  const optionLengths = alternativas.map(text => text.length);
  const correct = item.respostaCorreta.trim();
  const correctText = optionTextForAnswer(alternativas, correct);
  const maxOptionLength = Math.max(...optionLengths);
  const minOptionLength = Math.min(...optionLengths);
  const allText = `${item.enunciado}\n${alternativas.join('\n')}`;

  return {
    id: item.id,
    stemChars: item.enunciado.length,
    optionCount: alternativas.length,
    avgOptionChars: mean(optionLengths),
    optionLengthSpread: maxOptionLength - minOptionLength,
    correctIsLongest: correctText.length === maxOptionLength,
    hasScenario: /\b(Joao|João|Maria|empresa|sociedade|advogado|cliente|contrato|caso|situação|hipótese|procurou|ajuizou|celebrou|requereu)\b/i.test(allText),
    hasLegalCitation: /\b(art\.|artigo|lei|codigo|código|CPC|CPP|CLT|CF|Constituição|Estatuto|Súmula|sumula)\b/i.test(allText),
    hasOabTone: /\b(advogado|advogada|cliente|OAB|Exame de Ordem|ética profissional|Estatuto da Advocacia)\b/i.test(allText),
    hasStructuredComment: typeof item.comentario === 'string' && /##CORRETA|##ERRADAS|##FONTE|fonte/i.test(item.comentario),
    hasSourceUrl: typeof item.sourceUrl === 'string' && /^https?:\/\//.test(item.sourceUrl),
  };
}

function summarize(items) {
  const fs = items.map(features);
  return {
    count: fs.length,
    avgStemChars: round(mean(fs.map(f => f.stemChars))),
    avgOptionChars: round(mean(fs.map(f => f.avgOptionChars))),
    avgOptionLengthSpread: round(mean(fs.map(f => f.optionLengthSpread))),
    correctIsLongestRate: round(rate(fs.map(f => f.correctIsLongest))),
    scenarioRate: round(rate(fs.map(f => f.hasScenario))),
    legalCitationRate: round(rate(fs.map(f => f.hasLegalCitation))),
    oabToneRate: round(rate(fs.map(f => f.hasOabTone))),
    structuredCommentRate: round(rate(fs.map(f => f.hasStructuredComment))),
    sourceUrlRate: round(rate(fs.map(f => f.hasSourceUrl))),
  };
}

function compare(real, generated) {
  const checks = [];

  function add(status, metric, detail) {
    checks.push({ status, metric, detail });
  }

  const stemRatio = generated.avgStemChars / Math.max(real.avgStemChars, 1);
  if (stemRatio < 0.65 || stemRatio > 1.55) {
    add('fail', 'avgStemChars', `generated/real ratio ${round(stemRatio)} is outside 0.65..1.55`);
  } else if (stemRatio < 0.8 || stemRatio > 1.3) {
    add('warn', 'avgStemChars', `generated/real ratio ${round(stemRatio)} is drifting`);
  } else {
    add('pass', 'avgStemChars', 'generated stem length is close to real OAB sample');
  }

  if (generated.correctIsLongestRate > real.correctIsLongestRate + 0.2) {
    add('fail', 'correctIsLongestRate', 'correct answer is too often the longest option');
  } else {
    add('pass', 'correctIsLongestRate', 'correct option length does not expose answer by form');
  }

  if (generated.scenarioRate + 0.25 < real.scenarioRate) {
    add('warn', 'scenarioRate', 'generated questions have fewer concrete scenarios than real sample');
  } else {
    add('pass', 'scenarioRate', 'scenario density is compatible with real sample');
  }

  if (generated.legalCitationRate + 0.25 < real.legalCitationRate) {
    add('warn', 'legalCitationRate', 'generated questions cite fewer legal anchors than real sample');
  } else {
    add('pass', 'legalCitationRate', 'legal anchor density is compatible with real sample');
  }

  if (generated.structuredCommentRate < 0.95) {
    add('fail', 'structuredCommentRate', 'generated questions are missing structured comments/source markers');
  } else {
    add('pass', 'structuredCommentRate', 'generated questions include structured comments/source markers');
  }

  return checks;
}

const realQuestions = readJsonArray(realPath, 'real_questions');
const generatedQuestions = readJsonArray(generatedPath, 'generated_questions');

realQuestions.forEach((item, index) => validateQuestion(item, 'real_questions', index));
generatedQuestions.forEach((item, index) => validateQuestion(item, 'generated_questions', index));

const realSummary = summarize(realQuestions);
const generatedSummary = summarize(generatedQuestions);
const checks = compare(realSummary, generatedSummary);
const status = checks.some(check => check.status === 'fail')
  ? 'fail'
  : checks.some(check => check.status === 'warn')
    ? 'warn'
    : 'pass';

const report = {
  generatedAt: new Date().toISOString(),
  status,
  inputs: {
    real: path.relative(root, realPath),
    generated: path.relative(root, generatedPath),
  },
  real: realSummary,
  generated: generatedSummary,
  checks,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`OAB calibration ${status}: ${path.relative(root, outPath)}`);

if (status === 'fail') {
  process.exitCode = 1;
}
