import {CONTRACT_VERSION,DATA_KEYS,SELECTION_KEYS} from '../../core/contracts.mjs';

// A new scenario is a project of its own, not a cleared view of the old one: a new
// id, and factors, scores and selections that start empty instead of inheriting
// anything. It is built here so the start page never fabricates a record and so the
// same value can be checked without a browser.
export function newScenarioProject({id,title,scope,perspective='public'}) {
  return {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    id,
    title,
    revision: 0,
    view: {perspective: ['public','expert'].includes(perspective) ? perspective : 'public', module: 'workspace', objectId: null},
    scope: {regionId: scope?.regionId ?? null, years: [...(scope?.years ?? [])]},
    data: Object.fromEntries(DATA_KEYS.map(key => [key, []])),
    selection: Object.fromEntries(SELECTION_KEYS.map(key => [key, []]))
  };
}
