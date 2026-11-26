export class WorkspaceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export function check(condition, message, code = 'invalid-argument') {
  if (!condition) throw new WorkspaceError(code, message);
}
export const permit = (condition) =>
  check(
    condition,
    'You do not have permission for this action.',
    'permission-denied',
  );
export const roles = ['viewer', 'editor', 'admin'];
export const colors = [
  'slate',
  'gold',
  'blue',
  'violet',
  'orange',
  'green',
  'rose',
  'teal',
];
export const kinds = [
  'text',
  'longtext',
  'number',
  'date',
  'select',
  'multi',
  'url',
  'person',
  'check',
];
export const actions = ['create', 'edit', 'move', 'comment', 'attach'];
export const events = [
  'pr_opened',
  'pr_ready',
  'pr_merged',
  'pr_closed',
  'push',
  'assignment',
  'mention',
  'announcement',
  'direct_message',
  'channel_message',
];
export const eventNames = {
  pr_opened: 'Pull request opened',
  pr_ready: 'Ready for review',
  pr_merged: 'Pull request merged',
  pr_closed: 'Closed without merge',
  push: 'Push',
  assignment: 'Ticket assignment',
  mention: 'Mention',
  announcement: 'Announcement',
  direct_message: 'Direct message',
  channel_message: 'Channel message',
};
export const methods = ['inbox', 'banner', 'sound'];
export const isAdmin = (user) => ['owner', 'admin'].includes(user?.role);
export const level = (board, user) =>
  !user?.active
    ? null
    : isAdmin(user)
      ? 'admin'
      : board.members[user.id] || null;
export const allows = (role, minimum) =>
  roles.includes(role) &&
  roles.includes(minimum) &&
  roles.indexOf(role) >= roles.indexOf(minimum);
export const id = (value) => {
  check(
    typeof value === 'string' &&
      /^[A-Za-z0-9_-]{1,128}$/.test(value) &&
      !['constructor', 'prototype', '__proto__'].includes(value),
    'Invalid identifier.',
  );
  return value;
};
export function words(value, max, label, required = false) {
  check(
    typeof value === 'string' &&
      value.length <= max &&
      (!required || value.trim()),
    'Enter a valid ' + label + ' (up to ' + max + ' characters).',
  );
  return value.trim();
}
export function webUrl(value) {
  try {
    const u = new URL(value);
    if (
      ['https:', 'http:'].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      u.href.length <= 2048
    )
      return u.href;
  } catch {}
  throw new WorkspaceError(
    'invalid-argument',
    'Enter an HTTP or HTTPS address.',
  );
}
export const newId = (prefix) =>
  prefix + '_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20);
const opt = (id, label, active = true) => ({ id, label, active });
const choices = (names) =>
  names.map((name) => opt(name.toLowerCase().replaceAll(' ', '-'), name));
export function field(key, label, kind, more = {}) {
  return {
    key,
    label,
    kind,
    enabled: true,
    required: false,
    card: false,
    editRole: 'editor',
    options: [],
    ...more,
  };
}
export function boardTemplate(
  name = 'New board',
  project = 'Workspace',
  prefix = 'MX',
) {
  return {
    name,
    project,
    prefix,
    description: '',
    color: 'green',
    rev: 1,
    columns: [
      ['backlog', 'Backlog', 'slate'],
      ['todo', 'To do', 'gold'],
      ['doing', 'Doing', 'blue'],
      ['review', 'Review', 'violet'],
      ['testing', 'Testing', 'orange'],
      ['done', 'Done', 'green'],
    ].map(([id, name, color]) => ({ id, name, color })),
    fields: [
      field('title', 'Title', 'text', { required: true, card: true }),
      field('description', 'Description', 'longtext'),
      field('assignee', 'Assignee', 'person', { card: true }),
      field('estimate', 'Estimate in hours', 'number', { card: true }),
      field('type', 'Type', 'select', {
        card: true,
        options: choices([
          'Feature',
          'Design',
          'Update',
          'Research',
          'Content',
          'Planning',
        ]),
      }),
      field('priority', 'Priority', 'select', {
        card: true,
        options: choices(['High', 'Medium', 'Low']),
      }),
      field('actual', 'Real hours', 'number'),
      field('model', 'AI model', 'text'),
      field('team', 'Team', 'select', {
        options: choices(['Design', 'Engineering', 'Content']),
      }),
      field('start', 'Start date', 'date'),
      field('due', 'Due date', 'date'),
      field('labels', 'Labels', 'multi', {
        options: choices(['Product', 'UX', 'Art', 'QA']),
      }),
    ],
    features: { parents: true, links: true, comments: true, media: true },
    policy: {
      create: 'editor',
      edit: 'editor',
      move: 'editor',
      comment: 'editor',
      attach: 'editor',
    },
  };
}
function unique(items, key) {
  return new Set(items.map((x) => x[key])).size === items.length;
}
export function cleanConfig(input, previous) {
  const cfg = {
    name: words(input.name, 80, 'board name', true),
    project: words(input.project, 80, 'project name', true),
    description: words(input.description || '', 400, 'description'),
    prefix: words(input.prefix, 8, 'ticket prefix', true).toUpperCase(),
    color: input.color,
  };
  check(
    /^[A-Z][A-Z0-9]{0,7}$/.test(cfg.prefix) && colors.includes(cfg.color),
    'Choose a color and an alphanumeric ticket prefix.',
  );
  check(
    Array.isArray(input.columns) &&
      input.columns.length >= 1 &&
      input.columns.length <= 32 &&
      unique(input.columns, 'id'),
    'A board needs 1–32 uniquely identified columns.',
  );
  cfg.columns = input.columns.map((c) => {
    id(c.id);
    check(colors.includes(c.color), 'Invalid column color.');
    return {
      id: c.id,
      name: words(c.name, 48, 'column name', true),
      color: c.color,
    };
  });
  check(
    Array.isArray(input.fields) &&
      input.fields.length <= 64 &&
      unique(input.fields, 'key'),
    'Use up to 64 unique fields.',
  );
  cfg.fields = input.fields.map((f) => {
    id(f.key);
    check(
      kinds.includes(f.kind) && roles.includes(f.editRole),
      'Invalid field type or permission.',
    );
    const old = previous?.fields.find((x) => x.key === f.key);
    check(
      !old || old.kind === f.kind,
      'An existing field must keep its data type.',
    );
    const options = f.kind === 'select' || f.kind === 'multi' ? f.options : [];
    check(
      Array.isArray(options) && options.length <= 100 && unique(options, 'id'),
      'Choose up to 100 unique options.',
    );
    const clean = field(
      f.key,
      words(f.label, 56, 'field label', true),
      f.kind,
      {
        enabled: !!f.enabled,
        required: !!f.required,
        card: !!f.card,
        editRole: f.editRole,
        options: options.map((o) =>
          opt(
            id(o.id),
            words(o.label, 64, 'option label', true),
            o.active !== false,
          ),
        ),
      },
    );
    check(
      !old ||
        old.options.every((o) => clean.options.some((n) => n.id === o.id)),
      'Retire existing options to preserve ticket history.',
    );
    return clean;
  });
  check(
    !previous ||
      previous.fields.every((f) => cfg.fields.some((n) => n.key === f.key)),
    'Disable existing fields to preserve ticket history.',
  );
  const title = cfg.fields.find((f) => f.key === 'title');
  check(
    title?.kind === 'text' && title.enabled && title.required,
    'Title must be an enabled, required text field.',
  );
  const priority = cfg.fields.find((f) => f.key === 'priority');
  check(
    !priority ||
      (priority.options.length === 3 &&
        ['high', 'medium', 'low'].every((k) =>
          priority.options.some((o) => o.id === k && o.active),
        )),
    'Priority needs High, Medium, and Low.',
  );
  cfg.features = Object.fromEntries(
    ['parents', 'links', 'comments', 'media'].map((k) => [
      k,
      input.features?.[k] === true,
    ]),
  );
  cfg.policy = Object.fromEntries(
    actions.map((k) => {
      check(roles.includes(input.policy?.[k]), 'Select a role for ' + k + '.');
      return [k, input.policy[k]];
    }),
  );
  return cfg;
}
export const empty = (value) =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0);
export function ticketValues(board, role, incoming, current = {}) {
  check(
    incoming && typeof incoming === 'object' && !Array.isArray(incoming),
    'Invalid ticket fields.',
  );
  const result = { ...current };
  for (const [key, v] of Object.entries(incoming)) {
    const f = board.fields.find((f) => f.key === key);
    if (JSON.stringify(current[key]) === JSON.stringify(v)) continue;
    permit(f?.enabled && allows(role, f.editRole));
    if (empty(v)) {
      delete result[key];
      continue;
    }
    if (f.kind === 'number')
      check(
        typeof v === 'number' &&
          Number.isFinite(v) &&
          Math.abs(v) <= 1e10 &&
          (!['estimate', 'actual'].includes(key) || v >= 0),
        'Invalid number for ' + f.label + '.',
      );
    if (f.kind === 'check') check(typeof v === 'boolean', 'Invalid checkbox.');
    if (f.kind === 'person')
      check(Object.hasOwn(board.members, id(v)), 'Assign a board member.');
    if (f.kind === 'date')
      check(
        typeof v === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(v) &&
          Number.isFinite(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v,
        'Invalid date.',
      );
    if (f.kind === 'url') webUrl(v);
    if (f.kind === 'select' || f.kind === 'multi') {
      const selected = f.kind === 'multi' ? v : [v],
        prior = Array.isArray(current[key]) ? current[key] : [current[key]];
      check(
        Array.isArray(selected) &&
          selected.length <= 100 &&
          new Set(selected).size === selected.length &&
          selected.every((s) =>
            f.options.some(
              (o) => o.id === s && (o.active || prior.includes(s)),
            ),
          ),
        'Choose a valid option for ' + f.label + '.',
      );
    }
    result[key] =
      f.kind === 'text' || f.kind === 'longtext'
        ? words(v, f.kind === 'longtext' ? 16000 : 300, f.label, true)
        : v;
  }
  for (const f of board.fields)
    if (f.enabled && f.required)
      check(!empty(result[f.key]), f.label + ' is required.');
  if (
    board.fields.find((f) => f.key === 'due')?.enabled &&
    board.fields.find((f) => f.key === 'start')?.enabled &&
    result.start &&
    result.due
  )
    check(result.start <= result.due, 'Due date must follow the start date.');
  return result;
}
export function cleanLinks(value) {
  check(
    Array.isArray(value) && value.length <= 30,
    'Use up to 30 ticket links.',
  );
  return value.map((x) => ({
    label: words(x.label || '', 100, 'link label'),
    url: webUrl(x.url),
  }));
}
export const ticketKey = (board, t) =>
  board.prefix + '-' + String(t.seq).padStart(3, '0');
export function fieldText(f, value, members = []) {
  if (empty(value)) return '';
  if (f.kind === 'person')
    return members.find((m) => m.id === value)?.name || 'Former member';
  if (f.kind === 'select' || f.kind === 'multi')
    return (Array.isArray(value) ? value : [value])
      .map((v) => f.options.find((o) => o.id === v)?.label || v)
      .join(', ');
  if (f.kind === 'check') return value ? 'Yes' : 'No';
  return String(value);
}
export function cleanAcl(a = {}) {
  const ids = (list) => {
    check(Array.isArray(list) && list.length <= 250, 'Invalid access list.');
    return [...new Set(list.map(id))];
  };
  const rolesList = ids(a.roles || []);
  check(
    rolesList.every((r) => ['owner', 'admin', 'member'].includes(r)),
    'Invalid workspace role.',
  );
  return {
    everyone: a.everyone === true,
    roles: rolesList,
    groups: ids(a.groups || []),
    users: ids(a.users || []),
    exclude: ids(a.exclude || []),
  };
}
export function aclAllows(acl, user) {
  return !!(
    user?.active &&
    acl &&
    !acl.exclude.includes(user.id) &&
    (acl.everyone ||
      acl.roles.includes(user.role) ||
      (acl.groups || []).some(g => user.groups?.includes(g)) ||
      acl.users.includes(user.id))
  );
}
export const defaultPrefs = {
  presence: 'Online',
  theme: 'system',
  banners: true,
  sound: false,
  preset: 'forest',
  color: '#2c6956',
  events: {},
};
export const presenceStates = ['Online', 'Offline', 'Do Not Disturb'];
export function aggregatePresence(sessions = {}) {
  const values = Object.values(sessions || {}).map((s) => s.state);
  return (
    ['Do Not Disturb', 'Online', 'Idle'].find((s) => values.includes(s)) ||
    'Offline'
  );
}
export const defaultDelivery = () =>
  Object.fromEntries(
    events.map((e) => [e, { inbox: true, banner: true, sound: true }]),
  );
export function deliveryFor(
  event,
  policy,
  prefs = defaultPrefs,
  presence = 'Offline',
) {
  const enabled = (key) =>
    (policy?.overrides?.[event]?.[key] ??
      policy?.defaults?.[event]?.[key] ??
      true) &&
    (prefs.events?.[event]?.[key] ?? true);
  const live = ['Online', 'Idle'].includes(presence);
  return {
    inbox: enabled('inbox'),
    banner: live && enabled('banner') && prefs.banners !== false,
    sound: live && enabled('sound') && prefs.sound === true,
  };
}
export const channelActions = ['post', 'react', 'pin'];
export function channelAllows(ch, user, action) {
  if (
    !user?.active ||
    !ch ||
    (ch.kind === 'direct' && ch.users?.[user.id] !== true) ||
    (!isAdmin(user) && !ch.everyone && !ch.users?.[user.id])
  )
    return false;
  if (!action) return true;
  const role = ch.permissions[action];
  return role === 'member' || (role === 'admin' && isAdmin(user));
}
