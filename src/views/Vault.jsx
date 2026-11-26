import {Access,PeoplePicker,FolderPicker} from './Sharing.jsx';
import {Folder, Settings2} from 'lucide-react';
import React, { useState } from 'react';
import { Plus, KeyRound, ShieldCheck, Lock, Eye, Download } from 'lucide-react';
import { newId } from '../../functions/core/model.mjs';
import {
  Btn,
  Modal,
  Label,
  Check,
  Tabs,
  Empty,
  More,
  ErrorText,
  useJob,
  useLoad,
  usePages,
  saveFile,
} from '../ui.jsx';
function Register({ api, saved, onClose }) {
  const [v, set] = useState({
      id: newId('item'),
      name: '',
      collection: '',
      kind: 'credential',
      reference: '',
    }),
    job = useJob();
  const update = (k) => (e) => set({ ...v, [k]: e.target.value });
  return (
    <Modal title="Register vault reference" onClose={onClose}>
      <div className="form-body">
        <Label name="Display name">
          <input value={v.name} onChange={update('name')} />
        </Label>
        <Label name="Collection identifier">
          <input value={v.collection} onChange={update('collection')} />
        </Label>
        <Label name="Item type">
          <select value={v.kind} onChange={update('kind')}>
            <option value="credential">Password or shared account</option>
            <option value="environment">Environment file</option>
            <option value="document">Confidential document</option>
          </select>
        </Label>
        <Label
          name={
            v.kind === 'document'
              ? 'Object path in the private vault bucket'
              : 'Secret Manager version resource name'
          }
        >
          <input
            placeholder={
              v.kind === 'document'
                ? 'vault/contracts/document.pdf'
                : 'projects/PROJECT/secrets/NAME/versions/latest'
            }
            value={v.reference}
            onChange={update('reference')}
          />
        </Label>
        <ErrorText error={job.error} />
      </div>
      <footer>
        <Btn
          kind="primary"
          disabled={job.busy}
          onClick={() =>
            job.run(async () => {
              await api.command('vault.save', v);
              saved();
            })
          }
        >
          Register reference
        </Btn>
      </footer>
    </Modal>
  );
}
function Entry({api,me,members,folder,initial,onClose,saved}) {
  const [v,set]=useState(() => initial ? {...initial,acl:initial.acl || {everyone:false,users:[me.id],roles:[],groups:[],exclude:[]}} : {id:newId('item'),kind:'text',name:'',text:'',folder,
    independent:false,acl:{everyone:!!folder,users:folder ? [] : [me.id],roles:[],groups:[],exclude:[]}}),
    [file,pick]=useState(null),job=useJob(),update=o => set(current => ({...current,...o}));
  function chooseFile(f) {
    if(!f)return;
    pick(f); update({kind:'upload',name:v.name || f.name});
  }
  const save=() => job.run(async () => {
    let content=v.text || '';
    if(!initial && v.kind === 'upload') {
      if(!file || file.size>3*1024*1024) throw Error('Choose a file up to 3 MiB.');
      content=await new Promise((resolve,reject) => {
        const reader=new FileReader();reader.onload=() => resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);
      });
    }
    await api.command(initial ? 'vault.permissions' : 'vault.create',{
      id:v.id,name:v.name,folder:v.folder,kind:v.kind,rev:v.rev || 0,acl:v.acl,independent:v.independent,
      ...(!initial ? {content:v.kind === 'folder' ? '' : content,mime:file?.type || 'application/octet-stream'} : {})
    }); saved();
  });
  return <Modal wide title={initial ? 'Permissions · '+v.name : 'Add to sensitive data'} onClose={onClose}>
    <div className="form-body scroll" onPaste={e => {if(!initial && e.clipboardData.files.length) {
      e.preventDefault();chooseFile(e.clipboardData.files[0]);
    }}}>
      {!initial && <><Label name="Type"><select value={v.kind} onChange={e => update({kind:e.target.value})}>
        <option value="text">Secure text</option><option value="upload">Image or document</option><option value="folder">Folder</option>
      </select></Label><Label name="Name"><input autoFocus value={v.name} onChange={e => update({name:e.target.value})}/></Label>
      {v.kind === 'text' && <Label name="Sensitive text"><textarea rows={9} placeholder="Enter the information, or paste a screenshot."
        value={v.text} onChange={e => update({text:e.target.value})}/></Label>}
      {v.kind === 'upload' && <Label name="Choose a file or paste a screenshot · up to 3 MiB">
        <input type="file" onChange={e => chooseFile(e.target.files[0])}/>{file && <span>{file.name}</span>}</Label>}</>}
      {initial && <><FolderPicker api={api} action="vault.list" current={v.folder} exclude={v.id}
        change={(folder,location) => update({folder,location})}/>{v.location && <small>Location · {v.location}</small>}</>}
      {initial && !initial.managed && !initial.acl && <p>Saving applies the people and roles below in place of this reference’s existing grants.</p>}
      {!!v.folder && <Check checked={!!v.independent} onChange={e => update({independent:e.target.checked,
        ...(e.target.checked && v.acl.everyone ? {acl:{...v.acl,everyone:false,users:[me.id]}} : {})})}>
        Allow selected people to open this item without its parent folder</Check>}
      <Access {...{api,members}} acl={v.acl} set={acl => update({acl})}/>
      <ErrorText error={job.error}/></div>
    <footer><Btn disabled={job.busy} onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={job.busy || !v.name.trim()} onClick={save}>
      {initial ? 'Save permissions' : 'Create item'}</Btn></footer></Modal>;
}
function GrantForm({api,target,initial,tell}) {
  const [grant,set]=useState(initial),job=useJob();
  const references=useLoad(async () => {
    const items=[];let cursor=null;
    do {
      const page=await api.command('vault.list',{cursor});
      items.push(...page.items.filter(i => !i.managed && !i.acl));cursor=page.next;
    }while(cursor);
    return items;
  },[api]);
  const refs=references.data || [];
  const collections=[...new Set([...refs.map(i => i.collection),...grant.collections])].filter(Boolean);
  return <><Check checked={grant.all} onChange={e => set({...grant,all:e.target.checked})}>Allow all registered references</Check>
    {!grant.all && <>
      <PeoplePicker label="Collections" options={collections.map(id => ({id,name:id}))} value={grant.collections}
        change={collections => set({...grant,collections})}/>
      <PeoplePicker label="Individual references" options={refs} value={grant.items} change={items => set({...grant,items})}/>
    </>}
    <Btn disabled={job.busy} kind="primary" onClick={() => job.run(async () => {
      await api.command('vault.grant',{...grant,target});tell('Reference access saved.');
    })}>Save grants</Btn><ErrorText error={references.error || job.error}/></>;
}
function Grants({ api, members, tell }) {
  const [target, set] = useState(api.uid),
    loaded = useLoad(
      () => api.command('vault.grant.get', { target }),
      [api, target],
    );
  return (
    <div className="panel stack">
      <Label name="Member">
        <select value={target} onChange={(e) => set(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Label>
      {loaded.data && (
        <GrantForm
          key={target}
          {...{ api, target, tell }}
          initial={loaded.data}
        />
      )}
      <ErrorText error={loaded.error} />
    </div>
  );
}
function Audit({ api }) {
  const p = usePages(api, 'vault.audit', {});
  return (
    <div className="panel">
      {p.items.map((e, i) => (
        <div className="resource-row" key={i}>
          <span>{new Date(e.at).toLocaleString()}</span>
          <strong>{e.action}</strong>
          <small>
            {e.by} · {e.item || e.target}
          </small>
        </div>
      ))}
      <More page={p} />
    </div>
  );
}
export default function Vault({ api, me, members, tell }) {
  const [tab, tabs] = useState('Items'),
    [add, setAdd] = useState(''), [path,setPath] = useState([]), [access,editAccess] = useState(null),
    [reveal, show] = useState(null),
    page = usePages(api, 'vault.list', {folder:path.at(-1)?.id || ''}),
    job = useJob();
  React.useEffect(() => () => {if(reveal?.url)URL.revokeObjectURL(reveal.url);},[reveal]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Resources</div>
          <h1>Sensitive data</h1>
        </div>
        {me?.role === 'owner' && (
          <div className="row"><Btn onClick={() => setAdd('reference')}>Register reference</Btn>
            <Btn icon={Plus} kind="primary" onClick={() => setAdd('entry')}>Add item</Btn></div>
        )}
      </div>
      {me?.role === 'owner' && (
        <Tabs
          values={['Items', 'Reference grants', 'Access log']}
          value={tab}
          onChange={tabs}
        />
      )}
      {tab === 'Items' ? (
        <div className="panel">
          <nav className="folder-path" aria-label="Folder path"><button onClick={() => setPath([])}>Sensitive data</button>
            {path.map((f,i) => <button key={f.id} onClick={() => setPath(path.slice(0,i+1))}> › {f.name}</button>)}</nav>
          {[...page.items].sort((a,b) => Number(b.kind === 'folder')-Number(a.kind === 'folder') || a.name.localeCompare(b.name)).map((i) => (
            <div className="resource-row" key={i.id}>
              <span className="resource-icon">
                {i.kind === 'folder' ? <Folder size={18}/> : <Lock size={18}/> }
              </span>
              <div className="grow">
                <strong>{i.name}</strong>
                <small>
                  {i.collection} · {i.kind}

                </small>
              </div>
              {me.role === 'owner' && <Btn icon={Settings2} onClick={() => editAccess(i)}>Permissions</Btn>}
              <Btn
                icon={i.kind === 'document' ? Download : Eye}
                onClick={() =>
                  job.run(async () => {
                    if(i.kind === 'folder') {setPath([...path,i]);return;}
                    if(i.kind === 'upload' && /^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(i.mime)) {
                      const blob=await api.vaultRead(i.id);
                      show({name:i.name,url:URL.createObjectURL(blob.slice(0,blob.size,i.mime))});return;
                    }
                    if (['document','upload'].includes(i.kind)) {
                      await saveFile(
                        {
                          fileResponse: api.vaultResponse,
                          fileBlob: api.vaultRead,
                        },
                        i.id,
                        i.name,
                      );
                    } else {
                      const b = await api.vaultRead(i.id);
                      show({ name: i.name, value: await b.text() });
                    }
                  })
                }
              >
                {i.kind === 'folder' ? 'Open folder' : i.kind === 'document' ? 'Download' : 'Open'}
              </Btn>
            </div>
          ))}
          {!page.items.length && !page.loading && (
            <Empty>No vault items available to your account.</Empty>
          )}
          <More page={page} />
          <ErrorText error={job.error} />
        </div>
      ) : tab === 'Reference grants' ? (
        <Grants {...{ api, members, tell }} />
      ) : (
        <Audit api={api} />
      )}
      {(add === 'entry' || access) && <Entry {...{api,me,members}} folder={path.at(-1)?.id || ''} initial={access}
        onClose={() => {setAdd('');editAccess(null);}} saved={() => {setAdd('');editAccess(null);page.refresh();}}/>}
      {add === 'reference' && (
        <Register
          api={api}
          onClose={() => setAdd(false)}
          saved={() => {
            setAdd(false);
            page.refresh();
          }}
        />
      )}
      {reveal && (
        <Modal wide title={reveal.name} onClose={() => show(null)}>
          <div className="form-body">
            <p className="muted">
              Close this window when you finish using the value.
            </p>
            {reveal.url ? <img className="vault-image" src={reveal.url} alt={reveal.name}/> : <pre className="secret">{reveal.value}</pre>}
          </div>
        </Modal>
      )}
    </div>
  );
}
