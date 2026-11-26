import test from 'node:test';
import assert from 'node:assert/strict';
import { boardTemplate, channelAllows } from '../functions/core/model.mjs';

test('new boards include ticket labels and workflow columns', () => {
  const board = boardTemplate();
  assert.equal(board.fields.find(field => field.key === 'labels').kind, 'multi');
  assert.ok(board.columns.some(column => column.id === 'done'));
});
test('direct conversations are visible only to participants', () => {
  const direct = { kind: 'direct', users: { alice: true }, permissions: { post: 'member' } };
  assert.equal(channelAllows(direct, { id:'alice', active:true }, 'post'), true);
  assert.equal(channelAllows(direct, { id:'other', role:'owner', active:true }), false);
});
