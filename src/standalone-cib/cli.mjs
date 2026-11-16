#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runCib, compareCib } from './index.mjs';
try {
  if (!process.argv[2]) throw new Error('用法 node cli.mjs 请求文件.json');
  const request = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
  if (!['solve', 'compare'].includes(request.action)) throw new Error('action 必须为 solve 或 compare');
  const result = request.action === 'solve'
    ? runCib(request.input, request.options)
    : compareCib(request.input, request.change, request.options);
  console.log(JSON.stringify({ packageVersion: '0.1.1', ...result }, null, 2));
  if (result.status !== 'completed') process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({ status: 'invalid-input', message: error.message }));
  process.exitCode = 1;
}

