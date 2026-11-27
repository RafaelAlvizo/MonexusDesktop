import React, { useState } from 'react';
import {
  ExternalLink,
  Figma as FigmaIcon,
  Plus,
  Pencil,
  Link2,
} from 'lucide-react';
import {
  Btn,
  Label,
  Modal,
  ErrorText,
  useJob,
  useLoad,
  openLink,
} from '../ui.jsx';
import {
  mayContribute,
  isAdmin,
  figmaEmbed,
  newId,
} from '../../functions/core/model.mjs';

export default function Figma({ api, me, contributions }) {
  const list = useLoad(() => api.command('figma.list'), [api]),
    job = useJob();
  const [selected, select] = useState(''),
    [form, setForm] = useState(null),
    [preview, setPreview] = useState(null);
  const items = [...(list.data || []), ...(preview ? [preview] : [])],
    item = items.find((x) => x.id === selected);
  function openOriginal() {
    if (item.source) return openLink(item.source);
    const url = new URL(item.url);
    url.hostname = 'www.figma.com';
    url.searchParams.delete('embed-host');
    openLink(url.href);
  }
  function newFile() {
    setForm({ id: newId('fig'), name: '', url: '', rev: 0 });
  }
  function save(e) {
    e.preventDefault();
    job.run(async () => {
      const url = figmaEmbed(form.url);
      if (form.preview) {
        const original = new URL(form.url),
          slug = original.pathname.split('/')[3];
        const name = slug
          ? decodeURIComponent(slug).replaceAll('-', ' ')
          : 'Link preview';
        setPreview({ id: 'preview', name, url, source: original.href });
        select('preview');
        setForm(null);
        return;
      }
      await api.command('figma.save', form);
      select(form.id);
      setForm(null);
      list.refresh();
    });
  }
  return (
    <div className="page figma-view">
      <div className="page-head">
        <h1>Figma</h1>
        <div className="row wrap">
          <Btn icon={Link2} onClick={() => setForm({ preview: true, url: '' })}>
            Open link
          </Btn>
          {mayContribute(contributions, 'figma', me) && (
            <Btn kind="primary" icon={Plus} onClick={newFile}>
              Add Figma file
            </Btn>
          )}
        </div>
      </div>
      <ErrorText error={list.error} />
      {item ? (
        <>
          <div className="figma-tools">
            <Btn onClick={() => select('')}>All projects</Btn>
            <select
              aria-label="Figma file"
              value={item.id}
              onChange={(e) => select(e.target.value)}
            >
              {items.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {isAdmin(me) && item.id !== 'preview' && (
              <Btn icon={Pencil} onClick={() => setForm({ ...item })}>
                Edit file
              </Btn>
            )}
            <Btn icon={ExternalLink} onClick={openOriginal}>
              Open in Figma
            </Btn>
          </div>
          <iframe
            key={item.url}
            title={item.name}
            src={item.url}
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </>
      ) : items.length ? (
        <section className="panel stack" aria-label="Saved Figma projects">
          <h2>Choose a project</h2>
          {items.map(project => (
            <button className="resource-row" key={project.id} onClick={() => select(project.id)}>
              <FigmaIcon size={18} /> {project.name}
            </button>
          ))}
        </section>
      ) : (
        <div className="resource-empty">
          <FigmaIcon size={32} />
          <h3>{list.loading ? 'Loading files…' : 'No Figma files yet'}</h3>
          <p>
            {isAdmin(me)
              ? 'Add a public design, FigJam board or prototype to explore it here.'
              : 'Shared designs and FigJam boards appear here.'}
          </p>
        </div>
      )}
      {form && (
        <Modal
          title={
            form.preview
              ? 'Open a Figma link'
              : form.rev
                ? 'Edit Figma file'
                : 'Add Figma file'
          }
          onClose={() => setForm(null)}
        >
          <form onSubmit={save}>
            <div className="form-body">
              {!form.preview && (
                <Label name="File name">
                  <input
                    required
                    autoFocus
                    maxLength={100}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Label>
              )}
              <Label name="Figma share link">
                <input
                  required
                  type="url"
                  placeholder="https://www.figma.com/design/…"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                />
              </Label>
              <small>
                In Figma, set link access to “Anyone with the link can view.”
              </small>
              <ErrorText error={job.error} />
            </div>
            <footer>
              {!!form.rev && (
                <Btn
                  onClick={() =>
                    job.run(async () => {
                      await api.command('figma.remove', form);
                      setForm(null);
                      list.refresh();
                    })
                  }
                >
                  Remove from resource
                </Btn>
              )}
              <Btn onClick={() => setForm(null)}>Cancel</Btn>
              <button className="btn primary" disabled={job.busy}>
                {form.preview ? 'Open file' : 'Save file'}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  );
}
