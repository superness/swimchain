import{useState,useCallback,type FC}from'react';
import{useChatIdentity}from'../hooks/useChatIdentity';
import{useDm}from'../hooks/useDm';
interface P{onClose:()=>void;}
export const StartDmModal:FC<P>=({onClose})=>{const{identity}=useChatIdentity();const{sendRequest,activeDms}=useDm();const[pk,setPk]=useState('');const[s,setS]=useState(false);const[err,setErr]=useState<string|null>(null);const[ok,setOk]=useState(false);
const sub=useCallback(async(e:React.FormEvent)=>{e.preventDefault();const v=pk.trim();if(!v)return;const vl=v.toLowerCase();if(vl===identity?.publicKey?.toLowerCase()||vl===identity?.address?.toLowerCase()){setErr('Cannot DM self');return}if(activeDms.some(d=>d.otherPk.toLowerCase()===vl)){setErr('Already exists');return}setS(true);setErr(null);const r=await sendRequest(v);if(r){setOk(true);setTimeout(onClose,1e3)}else setErr('Failed — check the address/key');setS(false)},[pk,identity,activeDms,sendRequest,onClose]);
return<div className="dm-overlay" onClick={onClose} role="presentation"><div className="dm-modal" onClick={e=>e.stopPropagation()} role="dialog"><h2 style={{margin:0}}>New DM<button onClick={onClose} style={{float:'right',background:'none',border:'none',cursor:'pointer',fontSize:'1.2rem'}}>?</button></h2>
{ok?<p style={{color:'#3ba55c',textAlign:'center'}}>Sent!</p>:<form onSubmit={sub} style={{display:'flex',flexDirection:'column',gap:'.75rem',marginTop:'1rem'}}>
<input placeholder="cs1..." value={pk} onChange={e=>setPk(e.target.value)} autoFocus disabled={s} style={{padding:'.6rem',border:'1px solid #ddd',borderRadius:'4px',fontFamily:'monospace',width:'100%',boxSizing:'border-box'}}/>
{err&&<p style={{color:'#e03e2f',margin:0,fontSize:'.85rem'}}>{err}</p>}
<div style={{display:'flex',justifyContent:'flex-end',gap:'.5rem'}}><button type="button" onClick={onClose} disabled={s} style={{padding:'.5rem 1rem',border:'1px solid #ddd',borderRadius:'4px',background:'transparent',cursor:'pointer'}}>Cancel</button><button type="submit" disabled={s||!pk.trim()} style={{padding:'.5rem 1rem',border:'none',borderRadius:'4px',background:'#5865f2',color:'#fff',fontWeight:500,cursor:'pointer'}}>{s?'Sending...':'Send Request'}</button></div>
</form>}</div></div>;};
