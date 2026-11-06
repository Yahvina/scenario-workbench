const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),{fixture}=require('./solver-browser-fixtures.cjs');
// 假设口径已默认接受（界面不再有该勾选框）。
