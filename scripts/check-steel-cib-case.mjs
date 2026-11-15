import { readFile, stat } from 'node:fs/promises';
import { verifySteelCibBundle } from '../src/modules/exports/steel-cib-link.mjs';

try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/check-steel-cib-case.mjs case.json');
  const file = process.argv[2];
  if ((await stat(file)).size > 8 * 1024 * 1024) throw new Error('Case exceeds 8 MiB');
  const value = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  const bundle = await verifySteelCibBundle(value);
  process.stdout.write(JSON.stringify({
    valid: true, testOnly: true, year: bundle.cib.year,
    configuration: bundle.cib.configuration, factor: bundle.cib.factor,
    parameterValue: bundle.parameter.audit.writtenCoefficient, parameterUnit: bundle.parameter.audit.coefficientUnit,
    selectedScenarioRechecked: true, enumerationCountIndependentlyRecomputed: false,
    originalModelFilesReverified: false, researchMappingApproved: false, fullModelExecuted: false
  }, null, 2) + '\n');
} catch (error) {
  process.stderr.write('Case not verified: ' + error.message + '\n');
  process.exitCode = 1;
}
