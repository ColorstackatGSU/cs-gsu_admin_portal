import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Sponsor, Tier } from '../lib/admin';
import { errorMessage } from '../lib/admin';
import { sponsorStatusLabel, sponsorStatusPillClass } from '../lib/format';

const EMPTY = { name:'', slug:'', brandHex:'#0039A6', tierId:'', websiteUrl:'', status:'prospective' };
export default function Sponsors() {
  const [sponsors,setSponsors]=useState<Sponsor[]>([]), [tiers,setTiers]=useState<Tier[]>([]);
  const [form,setForm]=useState(EMPTY), [adding,setAdding]=useState(false), [error,setError]=useState('');
  async function load(){try{const[s,t]=await Promise.all([api.get<Sponsor[]>('/admin/sponsors'),api.get<Tier[]>('/admin/tiers')]);setSponsors(s);setTiers(t)}catch(e){setError(errorMessage(e))}}
  useEffect(()=>{Promise.all([api.get<Sponsor[]>('/admin/sponsors'),api.get<Tier[]>('/admin/tiers')]).then(([s,t])=>{setSponsors(s);setTiers(t)}).catch(e=>setError(errorMessage(e)))},[]);
  async function submit(e:FormEvent){e.preventDefault();setError('');try{await api.post('/admin/sponsors',{...form,tierId:form.tierId||null,brandHex:form.brandHex.toUpperCase()});setForm(EMPTY);setAdding(false);await load()}catch(x){setError(errorMessage(x))}}
  return <div className="wrap"><div className="page-head"><div><h1>Sponsors</h1><p className="muted">Companies and their portal access.</p></div><button className="btn btn-primary" onClick={()=>setAdding(!adding)}>Add sponsor</button></div>{error&&<div className="note note-error">{error}</div>}
    {adding&&<form className="card form-grid" onSubmit={submit}><Field label="Company name" value={form.name} onChange={name=>setForm({...form,name,slug:form.slug||slugify(name)})}/><Field label="Slug" value={form.slug} onChange={slug=>setForm({...form,slug})}/><Field label="Brand hex" value={form.brandHex} onChange={brandHex=>setForm({...form,brandHex})}/><Field label="Website" value={form.websiteUrl} onChange={websiteUrl=>setForm({...form,websiteUrl})}/><Select label="Tier" value={form.tierId} onChange={tierId=>setForm({...form,tierId})}><option value="">No tier</option>{tiers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</Select><Select label="Status" value={form.status} onChange={status=>setForm({...form,status})}><option value="prospective">Prospective</option><option value="active">Active</option><option value="lapsed">Lapsed</option></Select><div className="form-actions"><button className="btn btn-primary">Create sponsor</button></div></form>}
    <div className="card"><table className="table"><thead><tr><th>Company</th><th>Tier</th><th>Status</th><th>Website</th></tr></thead><tbody>{sponsors.map(s=><tr key={s.id}><td><Link className="link" to={`/sponsors/${s.id}`}>{s.name}</Link><div className="faint">{s.slug}</div></td><td>{s.tierName||'—'}</td><td><span className={sponsorStatusPillClass(s.status)}>{sponsorStatusLabel(s.status)}</span></td><td>{s.websiteUrl?<a className="link" href={s.websiteUrl} target="_blank">Visit</a>:'—'}</td></tr>)}</tbody></table>{!sponsors.length&&<p className="muted">No sponsors yet.</p>}</div></div>;
}
export function Field({label,value,onChange,type='text',required=true}:{label:string,value:string,onChange:(v:string)=>void,type?:string,required?:boolean}){return <label className="field"><span className="label">{label}</span><input className="input" type={type} value={value} required={required} onChange={e=>onChange(e.target.value)}/></label>}
export function Select({label,value,onChange,children}:{label:string,value:string,onChange:(v:string)=>void,children:ReactNode}){return <label className="field"><span className="label">{label}</span><select className="input" value={value} onChange={e=>onChange(e.target.value)}>{children}</select></label>}
function slugify(v:string){return v.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
