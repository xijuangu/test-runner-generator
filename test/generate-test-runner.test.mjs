import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildHtml,
  normalizeDataset,
  parseCsvDataset,
  parseJsonlDataset,
} from '../generate-test-runner.mjs';

const minimalDataset = {
  title: '风险管理模块测试执行页',
  subtitle: '标准化生成测试执行页',
  env: {
    backend: '127.0.0.1',
    db: '测试库',
    auth: 'Bearer Token',
    loginMethod: 'POST `/api/user/login`',
    loginBody: '{"username":"admin"}',
  },
  tables: [{ name: 'risk_sensitive_word', purpose: '敏感词' }],
  cases: [
    {
      id: 'TC-01',
      title: '列表加载',
      name: '验证列表加载',
      precondition: '已有数据',
      steps: ['打开页面', '查看表格'],
      expected: ['表格有数据'],
      category: '前端操作',
      module: '风险记录',
      regression: true,
    },
  ],
};

test('normalizes a dataset and derives regression rows', () => {
  const normalized = normalizeDataset(minimalDataset);

  assert.equal(normalized.cases.length, 1);
  assert.match(normalized.storageKey, /^test-runner:/);
  assert.deepEqual(normalized.regression, [
    { id: 'TC-01', name: '验证列表加载', reason: '回归必测' },
  ]);
  assert.equal(normalized.summary.frontend, 1);
  assert.equal(normalized.summary.api, 0);
});

test('fills defaults for sparse cases and accepts flexible env fields', () => {
  const normalized = normalizeDataset({
    env: {
      '后端地址': '10.0.0.1',
      '认证方式': 'Bearer Token',
      '自定义说明': '按项目调整',
    },
    cases: [{ id: 'TC-00' }],
  });

  assert.equal(normalized.cases[0].title, 'TC-00');
  assert.equal(normalized.cases[0].name, 'TC-00');
  assert.equal(normalized.cases[0].precondition, '无');
  assert.deepEqual(normalized.cases[0].steps, ['按测试目标执行']);
  assert.deepEqual(normalized.cases[0].expected, ['符合预期']);
  assert.equal(normalized.cases[0].category, '默认');
  assert.equal(normalized.cases[0].module, '默认-默认');
  assert.deepEqual(normalized.env, [
    { label: '后端地址', value: '10.0.0.1', code: false },
    { label: '认证方式', value: 'Bearer Token', code: false },
    { label: '自定义说明', value: '按项目调整', code: false },
  ]);
});

test('generates a stable storage key from title and case ids', () => {
  const first = normalizeDataset(minimalDataset).storageKey;
  const second = normalizeDataset({ ...minimalDataset }).storageKey;
  const different = normalizeDataset({
    ...minimalDataset,
    cases: [{ ...minimalDataset.cases[0], id: 'TC-99' }],
  }).storageKey;

  assert.equal(first, second);
  assert.notEqual(first, different);
});

test('builds an html page by replacing the template DATA payload', () => {
  const html = buildHtml('<script>const DATA = {"old":true};\nconst STORAGE_KEY =', minimalDataset);

  assert.match(html, /const DATA = \{/);
  assert.doesNotMatch(html, /"old":true/);
  assert.match(html, /"label": "后端地址"/);
  assert.match(html, /"value": "127\.0\.0\.1"/);
  assert.match(html, /"storageKey": "test-runner:/);
  assert.match(html, /const STORAGE_KEY =/);
});

test('generated execution page does not contain nested raw script close tags', async () => {
  const template = await readFile(new URL('../template.html', import.meta.url), 'utf8');
  const html = buildHtml(template, minimalDataset);
  const rawScriptCloseCount = html.match(/<\/script>/g)?.length ?? 0;

  assert.equal(rawScriptCloseCount, 1);
});

test('template uses the corrected short quote inline-rendering regex', async () => {
  const template = await readFile(new URL('../template.html', import.meta.url), 'utf8');

  assert.ok(template.includes('.replace(/"([^"]{1,18})"/g'));
  assert.ok(!template.includes('.replace(/"([^"](1, 18))"/g'));
});

test('parses jsonl test cases into a standard dataset', () => {
  const parsed = parseJsonlDataset([
    JSON.stringify({
      id: 'TC-02',
      title: '上下文',
      steps: ['点击查看'],
      expected: ['显示上下文'],
      regression: false,
    }),
  ].join('\n'));

  assert.equal(parsed.cases[0].id, 'TC-02');
  assert.deepEqual(parsed.cases[0].steps, ['点击查看']);
  assert.equal(parsed.cases[0].category, '默认');
  assert.equal(parsed.cases[0].module, '默认-默认');
});

test('parses csv test cases with pipe-separated steps and expected results', () => {
  const csv = [
    'id,title,name,module,category,regression,precondition,steps,expected',
    'TC-03,搜索,关键词搜索,风险记录,前端操作,true,已有数据,输入关键词|回车,只显示匹配记录|可清空',
  ].join('\n');

  const parsed = parseCsvDataset(csv);

  assert.equal(parsed.cases[0].id, 'TC-03');
  assert.deepEqual(parsed.cases[0].steps, ['输入关键词', '回车']);
  assert.deepEqual(parsed.cases[0].expected, ['只显示匹配记录', '可清空']);
  assert.equal(parsed.cases[0].regression, true);
});
