import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boardTemplate,
  channelAllows,
  figmaEmbed,
} from '../functions/core/model.mjs';

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

test('Figma embeds preserve the shared view and stay on the official embed origin', () => {
  const embed = new URL(
    figmaEmbed(
      'https://www.figma.com/board/abcdefghijklmnopqrstuv/Planning?node-id=1-2',
    ),
  );
  assert.equal(embed.origin, 'https://embed.figma.com');
  assert.equal(embed.searchParams.get('node-id'), '1-2');
  assert.throws(() =>
    figmaEmbed('https://example.com/board/abcdefghijklmnopqrstuv'),
  );
  assert.throws(() => figmaEmbed('https://www.figma.com/files/team/123'));
});
