import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentType } from '../src/attachmentTypes.mjs';
import {
  boardTemplate,
  channelAllows,
  figmaEmbed,cleanAcl,mayContribute,
} from '../functions/core/model.mjs';

test('older uploads with generic MIME types still select the correct preview', () => {
  const cases = [
    ['Sidney Harbour Waterfront Friends.PNG', 'image'],
    ['recording.webm', 'video'],
    ['voice.wav', 'audio'],
    ['contract.PDF', 'pdf'],
    ['plan.docx', 'office'],
    ['notes.txt', 'text'],
    ['archive.zip', 'other'],
  ];
  for (const [name, kind] of cases)
    assert.equal(attachmentType({ name, mime: 'application/octet-stream' }).kind, kind);
  assert.equal(attachmentType({ name: 'upload', mime: 'image/jpeg' }).kind, 'image');
});

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

test('resource contribution policies distinguish roles, members and individual actions', () => {
  const member={id:'alice',role:'member',active:true,groups:['design']};
  const policy={docs:cleanAcl({groups:['design']}),drive:cleanAcl({users:['bob']})};
  assert.equal(mayContribute(policy,'docs',member),true);
  assert.equal(mayContribute(policy,'drive',member),false);
  assert.equal(mayContribute({},'vault',{...member,role:'admin'}),false);
  assert.equal(mayContribute({},'notes',member),true);
  assert.equal(mayContribute(policy,'docs',{...member,active:false}),false);
  assert.equal(mayContribute({docs:cleanAcl({everyone:true,exclude:['alice']})},'docs',member),false);
});
