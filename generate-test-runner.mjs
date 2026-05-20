#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE = path.resolve(__dirname, 'template.html');

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [String(value)];
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean);
  return String(value ?? '')
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'y', '是'].includes(String(value ?? '').trim().toLowerCase());
}

function defaultModule(category) {
  return `默认-${category}`;
}

function normalizeCase(raw, index) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`第 ${index + 1} 条用例必须是对象`);
  }
  const id = String(raw.id ?? raw.编号 ?? '').trim();
  if (!id) throw new Error(`第 ${index + 1} 条用例缺少 id`);

  const category = String(raw.category ?? raw.类型 ?? '默认').trim() || '默认';
  const module = String(raw.module ?? raw.模块 ?? defaultModule(category)).trim() || defaultModule(category);
  const steps = splitList(raw.steps ?? raw.测试步骤);
  const expected = splitList(raw.expected ?? raw.预期结果);

  return {
    id,
    title: String(raw.title ?? raw.标题 ?? raw.name ?? raw.测试案例名 ?? id).trim(),
    name: String(raw.name ?? raw.测试案例名 ?? raw.title ?? raw.标题 ?? id).trim(),
    precondition: String(raw.precondition ?? raw.测试前提 ?? raw.preconditions ?? '无').trim(),
    steps: steps.length ? steps : ['按测试目标执行'],
    expected: expected.length ? expected : ['符合预期'],
    category,
    module,
    regression: asBoolean(raw.regression ?? raw.是否回归 ?? false),
  };
}

function createStorageKey(title, cases) {
  const signature = JSON.stringify({
    title,
    caseIds: cases.map(testCase => testCase.id),
  });
  const hash = createHash('sha256').update(signature).digest('hex').slice(0, 16);
  return `test-runner:${hash}`;
}

function normalizeEnvValue(label, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      label: String(value.label ?? value.name ?? label).trim(),
      value: String(value.value ?? value.content ?? '').trim(),
      code: asBoolean(value.code ?? false),
    };
  }
  return {
    label: String(label).trim(),
    value: String(value ?? '').trim(),
    code: false,
  };
}

function normalizeEnv(rawEnv = {}, legacyInput = {}) {
  if (Array.isArray(rawEnv)) {
    return rawEnv
      .map((item, index) => normalizeEnvValue(item.label ?? item.name ?? `环境项 ${index + 1}`, item))
      .filter(item => item.label && item.value);
  }

  const merged = {...rawEnv};
  if (legacyInput.测试环境) {
    Object.assign(merged, {
      后端地址: legacyInput.测试环境.后端地址,
      数据库: legacyInput.测试环境.数据库,
      认证方式: legacyInput.测试环境.认证方式,
    });
  }
  if (legacyInput.登录接口) {
    Object.assign(merged, {
      登录接口: legacyInput.登录接口.请求,
      登录Body: {value: legacyInput.登录接口.Body, code: true},
    });
  }

  const legacyLabelMap = {
    backend: '后端地址',
    db: '数据库',
    auth: '认证方式',
    loginMethod: '登录接口',
    loginBody: '登录Body',
  };

  return Object.entries(merged)
    .map(([key, value]) => normalizeEnvValue(legacyLabelMap[key] ?? key, {
      value,
      code: key === 'loginMethod' || key === 'loginBody',
    }))
    .filter(item => item.label && item.value);
}

export function normalizeDataset(raw) {
  const input = Array.isArray(raw) ? { cases: raw } : { ...raw };
  const cases = asArray(input.cases ?? input.用例).map(normalizeCase);
  if (!cases.length) throw new Error('输入数据至少需要 1 条测试用例');
  const title = String(input.title ?? input.标题 ?? '测试执行页');

  const tables = asArray(input.tables ?? input.涉及数据表).map(table => ({
    name: String(table.name ?? table.表名 ?? '').trim(),
    purpose: String(table.purpose ?? table.用途 ?? '').trim(),
  })).filter(table => table.name);

  const regression = asArray(input.regression ?? input.回归测试清单);
  const regressionRows = regression.length
    ? regression.map(row => ({
        id: String(row.id ?? row.编号 ?? '').trim(),
        name: String(row.name ?? row.名称 ?? row.title ?? '').trim(),
        reason: String(row.reason ?? row.回归理由 ?? '').trim(),
      })).filter(row => row.id)
    : cases
        .filter(testCase => testCase.regression)
        .map(testCase => ({ id: testCase.id, name: testCase.name, reason: '回归必测' }));

  const frontend = cases.filter(testCase => testCase.category === '前端操作').length;
  const api = cases.filter(testCase => testCase.category === '接口边界').length;

  return {
    title,
    subtitle: String(input.subtitle ?? input.说明 ?? '面向测试执行：按步骤勾选、记录结果、标记状态；所有进度自动保存在当前浏览器。'),
    storageKey: String(input.storageKey ?? input.存储键 ?? createStorageKey(title, cases)),
    env: normalizeEnv(input.env, input),
    tables,
    cases,
    regression: regressionRows,
    summary: {
      total: cases.length,
      frontend,
      api,
      regression: cases.filter(testCase => testCase.regression).length,
    },
  };
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map(cell => cell.trim());
}

export function parseCsvDataset(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error('CSV 至少需要表头和 1 行数据');
  const headers = parseCsvLine(lines[0]);
  const cases = lines.slice(1).map(line => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
  return normalizeDataset({ cases });
}

export function parseJsonlDataset(content) {
  const cases = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`JSONL 第 ${index + 1} 行解析失败：${error.message}`);
      }
    });
  return normalizeDataset({ cases });
}

export function buildHtml(template, dataset) {
  const data = normalizeDataset(dataset);
  const payload = `const DATA = ${JSON.stringify(data, null, 2)};\nconst STORAGE_KEY =`;
  if (!template.includes('const DATA =')) {
    throw new Error('模板中未找到 const DATA = 数据占位');
  }
  return template.replace(/const DATA = [\s\S]*?\nconst STORAGE_KEY =/, payload);
}

function detectFormat(inputPath, explicitFormat) {
  if (explicitFormat) return explicitFormat;
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.jsonl') return 'jsonl';
  if (ext === '.csv') return 'csv';
  return 'json';
}

export async function loadDataset(inputPath, format) {
  const content = await readFile(inputPath, 'utf8');
  const actualFormat = detectFormat(inputPath, format);
  if (actualFormat === 'json') return normalizeDataset(JSON.parse(content));
  if (actualFormat === 'jsonl') return parseJsonlDataset(content);
  if (actualFormat === 'csv') return parseCsvDataset(content);
  throw new Error(`不支持的输入格式：${actualFormat}`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') args.input = argv[++i];
    else if (arg === '--output' || arg === '-o') args.output = argv[++i];
    else if (arg === '--template' || arg === '-t') args.template = argv[++i];
    else if (arg === '--format' || arg === '-f') args.format = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`未知参数：${arg}`);
  }
  return args;
}

function help() {
  return [
    '用法：node generate-test-runner.mjs --input <data.json|data.jsonl|data.csv> --output <runner.html>',
    '',
    '参数：',
    '  -i, --input     标准化测试数据文件',
    '  -o, --output    输出 HTML 文件',
    '  -t, --template  HTML 模板，默认使用内置模板',
    '  -f, --format    输入格式：json、jsonl、csv；默认按扩展名判断',
  ].join('\n');
}

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const args = parseArgs(argv);
  if (args.help) return help();
  if (!args.input || !args.output) throw new Error('必须提供 --input 和 --output');

  const inputPath = path.resolve(cwd, args.input);
  const outputPath = path.resolve(cwd, args.output);
  const templatePath = path.resolve(cwd, args.template ?? DEFAULT_TEMPLATE);
  const [dataset, template] = await Promise.all([
    loadDataset(inputPath, args.format),
    readFile(templatePath, 'utf8'),
  ]);

  await writeFile(outputPath, buildHtml(template, dataset), 'utf8');
  return `已生成：${outputPath}`;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main()
    .then(message => {
      if (message) console.log(message);
    })
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
