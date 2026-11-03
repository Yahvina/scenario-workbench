import { ContractError } from './contracts.mjs';

export function createActions(store) {
  const wrap = mutate => payload => {
    const before = store.read();
    try {
      mutate(payload);
      const after = store.read();
      return { ok: true, projectId: after.id, revision: after.revision, scientificChanged: before.id !== after.id || before.revision !== after.revision };
    } catch (error) {
      return { ok: false, error: { code: error.code || 'INVALID_INPUT', message: error.message, recordIds: error.recordIds || [], recoveryAction: error.recoveryAction || '检查输入后重试' } };
    }
  };
  return {
    updateProjectDetails: wrap(value => store.updateProjectDetails(value)),
    updateScope: wrap(value => store.setScope(value)),
    selectElements: wrap(value => store.setSelection(value)),
    replaceProject: wrap(value => store.replaceProject(value)),
    saveCollection: wrap(({ key, records }) => store.setData(key, records)),
    editPathPoint: wrap(({ pathId, pointIndex, point }) => {
      const paths = store.read().data.paths;
      const path = paths.find(item => item.id === pathId);
      if (!path || !Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= path.points.length) throw new ContractError('PATH_POINT_NOT_FOUND', '路径节点不存在');
      path.points[pointIndex] = structuredClone(point);
      path.version++;
      store.setData('paths', paths);
    }),
    saveJudgment: wrap(value => {
      const judgments = store.read().data.judgments;
      const position = judgments.findIndex(item => item.id === value.id);
      if (position < 0) judgments.push(value); else judgments[position] = value;
      store.setData('judgments', judgments);
    })
  };
}
