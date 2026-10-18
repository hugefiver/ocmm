import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveHistoryGitWriteGuard } from '../src/history-policy.ts';
import { decidePreToolExecution } from '../src/guards.ts';
import { DEFAULT_DSMM_SETTINGS } from '../src/settings.ts';

test('history effective Git guard matches real guard decisions for full access and scoped policy', () => {
  const exec = { name: 'pwsh', arguments: { command: 'git commit -m isolated-policy-probe' } };
  for (const nativeFullAccess of [false, true]) {
    for (const gitWriteGuard of ['ask', 'deny', 'off']) {
      for (const scope of ['always', 'off', 'deepwork-or-dsmm-agent']) {
        for (const active of [false, true]) {
          const settings = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, scope, gitWriteGuard } };
          const decision = decidePreToolExecution(exec, settings, { active: () => active }, nativeFullAccess);
          assert.equal(effectiveHistoryGitWriteGuard(settings, nativeFullAccess, active), decision?.kind ?? 'off');
        }
      }
    }
  }
  const settings = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, scope: 'always', gitWriteGuard: 'ask' } };
  assert.equal(effectiveHistoryGitWriteGuard(settings, true, true), 'off');
  assert.equal(effectiveHistoryGitWriteGuard({ ...settings, guards: { ...settings.guards, gitWriteGuard: 'deny' } }, true, true), 'deny');
});
