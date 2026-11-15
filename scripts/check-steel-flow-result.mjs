import { readFile, stat } from 'node:fs/promises';
import { STEEL_FLOW_MAX_BYTES, verifySteelFlowResult } from '../src/modules/exports/steel-flow-result.mjs';

try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/check-steel-flow-result.mjs result-bundle.json');
  const file = process.argv[2];
  if ((await stat(file)).size > STEEL_FLOW_MAX_BYTES) throw new Error('Result bundle exceeds 16 MiB');
  const verified = await verifySteelFlowResult(JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')));
  process.stdout.write(JSON.stringify({ valid: true, testOnly: true, linkedCib: !!verified.cibCase, target: verified.report.target, rows: verified.rows, validation: verified.validation }, null, 2) + '\n');
} catch (error) {
  process.stderr.write('Result not verified: ' + error.message + '\n');
  process.exitCode = 1;
}
