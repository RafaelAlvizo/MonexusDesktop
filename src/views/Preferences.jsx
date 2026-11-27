import {
  Contributions,
  AssistantConnection,
  profileImage,
} from './ConnectionSettings.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { getMeetingRingtone, meetingRingtones, meetingSoundEnabled, ringMeeting, setMeetingRingtone, setMeetingSound } from '../meetingAudio.mjs';
import { Btn, Label, Check, Tabs, ErrorText, useJob } from '../ui.jsx';
import {
  events,
  eventNames,
  methods,
  presenceStates,
  isAdmin,
} from '../../functions/core/model.mjs';
export function Matrix({ value, onChange, inherit = false }) {
  return (
    <div className="matrix">
      <table>
        <thead>
          <tr>
            <th>Event</th>
            {methods.map((m) => (
              <th key={m}>{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e}>
              <td>{eventNames[e]}</td>
              {methods.map((m) => (
                <td key={m}>
                  <select
                    aria-label={eventNames[e] + ' ' + m}
                    value={
                      value?.[e]?.[m] === undefined
                        ? inherit
                          ? 'inherit'
                          : 'on'
                        : value[e][m]
                          ? 'on'
                          : 'off'
                    }
                    onChange={(ev) => {
                      const v = ev.target.value,
                        row = { ...value?.[e] };
                      if (v === 'inherit') delete row[m];
                      else row[m] = v === 'on';
                      onChange({ ...value, [e]: row });
                    }}
                  >
                    {inherit && <option value="inherit">Workspace default</option>}
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default function Preferences({
  api,
  me,
  members,
  contributions,
  prefs,
  onPrefs,
  tell,

  signOut,
}) {
  const [section, choose] = useState('Profile'),
    [p, set] = useState({
      ...prefs,
      presence: prefs.presence === 'Idle' ? 'Online' : prefs.presence,
    }),
    [photo, setPhoto] = useState(me?.photo || ''),
    [name, setName] = useState(me?.name || ''),
    [ringtone, setRingtone] = useState(() => meetingSoundEnabled(me.id, 'ringtone')),
    [ringtoneChoice, chooseRingtone] = useState(() => getMeetingRingtone(me.id)),
    preview = useRef(null),
    job = useJob(),
    patch = (o) => set({ ...p, ...o });
  useEffect(() => () => preview.current?.(), [section]);
  const save = () =>
    job.run(async () => {
      await api.command('profile.save', { name, prefs: p, photo });
      setMeetingSound(me.id, 'ringtone', ringtone);
      setMeetingRingtone(me.id, ringtoneChoice);
      onPrefs(p);
      tell('Settings saved.');
    });
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>Settings</h1>
        </div>
        {section !== 'AI assistant' && section !== 'Resource permissions' && (
          <Btn kind="primary" onClick={save} disabled={job.busy}>
            Save settings
          </Btn>
        )}
      </div>
      <Tabs
        values={[
          'Profile',
          'Notifications',
          'AI assistant',
          ...(isAdmin(me) ? ['Resource permissions'] : []),
        ]}
        value={section}
        onChange={choose}
      />
      {section === 'AI assistant' ? (
        <AssistantConnection api={api} />
      ) : section === 'Resource permissions' ? (
        <Contributions {...{ api, me, members, contributions }} />
      ) : section === 'Profile' ? (
        <div className="panel stack">
          <div className="section-line">
            <h2>Profile &amp; appearance</h2>
            <Btn disabled={job.busy} onClick={() => job.run(signOut)}>
              Sign out
            </Btn>
          </div>
          <div className="profile-picture">
            {photo && <img alt="Profile picture preview" src={photo} />}
            <Label name="Profile picture">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file)
                    job.run(async () => setPhoto(await profileImage(file)));
                }}
              />
            </Label>
            {photo && <Btn onClick={() => setPhoto('')}>Remove picture</Btn>}
          </div>
          <Check checked={!!p.clickSounds} onChange={e => patch({ clickSounds: e.target.checked })}>
            Play interface click sounds
          </Check>
          <div className="form-grid">
            <Label name="Display name">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Label>
            <Label name="Email">
              <input value={me?.email || ''} disabled />
            </Label>
            <Label name="Presence">
              <select
                value={p.presence}
                onChange={(e) => patch({ presence: e.target.value })}
              >
                {presenceStates.map((s) => (
                  <option key={s} value={s}>
                    {s === 'system'
                      ? 'Match Windows'
                      : s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </Label>
            <Label name="Workspace colors">
              <select
                value={p.palette || 'forest'}
                onChange={(e) => patch({ palette: e.target.value })}
              >
                {['forest', 'ocean', 'plum', 'slate'].map((color) => (
                  <option key={color} value={color}>
                    {color[0].toUpperCase() + color.slice(1)}
                  </option>
                ))}
              </select>
            </Label>
            <Label name="Theme">
              <select
                value={p.theme}
                onChange={(e) => patch({ theme: e.target.value })}
              >
                {['system', 'light', 'dark'].map((s) => (
                  <option key={s} value={s}>
                    {s === 'system'
                      ? 'Match Windows'
                      : s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </Label>
          </div>
        </div>
      ) : (
        <div className="panel stack">
          <h2>Notifications</h2>
          <Check
            checked={p.banners}
            onChange={(e) => patch({ banners: e.target.checked })}
          >
            Show a banner when an alert arrives
          </Check>
          <Check
            checked={p.sound}
            onChange={(e) => patch({ sound: e.target.checked })}
          >
            Play notification sounds
          </Check>
          <Check checked={ringtone} onChange={e => setRingtone(e.target.checked)}>
            Ring for incoming calls and meeting starts on this device
          </Check>
          <div className="row wrap">
            <Label name="Meeting ringtone">
              <select value={ringtoneChoice} onChange={e => chooseRingtone(e.target.value)}>
                {meetingRingtones.map(tone => <option key={tone.id} value={tone.id}>{tone.name}</option>)}
              </select>
            </Label>
            <Btn onClick={() => {
              preview.current?.();
              preview.current = ringMeeting(900, ringtoneChoice);
            }}>Preview ringtone</Btn>
          </div>
          <div className="form-grid">
            <Label name="Banner color">
              <select
                value={p.preset}
                onChange={(e) => patch({ preset: e.target.value })}
              >
                {['forest', 'indigo', 'custom'].map((k) => (
                  <option key={k} value={k}>
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </select>
            </Label>
            {p.preset === 'custom' && (
              <Label name="In-app banner color">
                <input
                  type="color"
                  value={p.color}
                  onChange={(e) => patch({ color: e.target.value })}
                />
              </Label>
            )}
          </div>
          <p className="muted">
            Offline and Do Not Disturb pause banners and sounds. Choose
            “Workspace default” below to use your team’s notification settings.
          </p>
          <details className="advanced-settings">
            <summary>Customize notifications by event</summary>
            <Matrix
              value={p.events}
              onChange={(events) => patch({ events })}
              inherit
            />
          </details>
        </div>
      )}
      <ErrorText error={job.error} />
    </div>
  );
}
