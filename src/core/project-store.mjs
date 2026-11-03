import { CONTRACT_VERSION, DATA_KEYS, SELECTION_KEYS, VIEW_MODULES, ContractError, validateProject, scientificKey } from './contracts.mjs';

const clone = value => structuredClone(value);

export function createProjectStore(id, initial = null) {
  let project = initial ? clone(initial) : {
    schemaVersion: 1, contractVersion: CONTRACT_VERSION, id, title: '未命名情景项目', revision: 0,
    view: { perspective: 'public', module: 'workspace', objectId: null },
    scope: { regionId: null, years: [] },
    data: Object.fromEntries(DATA_KEYS.map(key => [key, []])),
    selection: Object.fromEntries(SELECTION_KEYS.map(key => [key, []]))
  };
  validateProject(project);
  const listeners = new Set();
  function commit(next) {
    next.revision = project.revision + (scientificKey(next) === scientificKey(project) ? 0 : 1);
    validateProject(next);
    project = clone(next);
    listeners.forEach(listener => listener(clone(project)));
  }
  return {
    read: () => clone(project),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setView(patch) {
      if (!patch || Object.keys(patch).some(key => !['perspective', 'module', 'objectId'].includes(key)) || ('module' in patch && !VIEW_MODULES.includes(patch.module))) throw new ContractError('INVALID_VIEW', '未知界面字段');
      const next = clone(project);
      next.view = { ...next.view, ...clone(patch) };
      commit(next);
    },
    setData(key, records) {
      if (!DATA_KEYS.includes(key) || !Array.isArray(records)) throw new ContractError('INVALID_COLLECTION', '未知数据集合');
      const next = clone(project);
      next.data[key] = clone(records);
      commit(next);
    },
    setScope(scope) {
      const next = clone(project);
      next.scope = clone(scope);
      commit(next);
    },
    setSelection(patch) {
      if (!patch || Object.keys(patch).some(key => !SELECTION_KEYS.includes(key))) throw new ContractError('INVALID_SELECTION', '未知选择字段');
      const next = clone(project);
      next.selection = { ...next.selection, ...clone(patch) };
      commit(next);
    },
    updateProjectDetails({ title, scope }) {
      const next = clone(project);
      next.title = title;
      next.scope = clone(scope);
      commit(next);
    },
    replaceProject(value) {
      validateProject(value);
      const next = clone(value);
      if (next.id !== project.id) {
        project = next;
        listeners.forEach(listener => listener(clone(project)));
      } else commit(next);
    },
    snapshot() {
      return clone({ schemaVersion: 1, contractVersion: CONTRACT_VERSION, projectId: project.id, revision: project.revision, scope: project.scope, data: project.data, selection: project.selection });
    },
    isCurrent(snapshot) {
      return snapshot?.contractVersion === CONTRACT_VERSION && snapshot?.projectId === project.id && snapshot?.revision === project.revision && scientificKey(snapshot) === scientificKey(project);
    }
  };
}
