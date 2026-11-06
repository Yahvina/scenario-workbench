const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const {fixture}=require('./solver-browser-fixtures.cjs'),home=require('./home-controls.cjs');
// 假设口径已默认接受（界面不再有该勾选框）。
