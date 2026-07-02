import{useState,useCallback,type FC}from'react';
import{useDm}from'../hooks/useDm';
import{truncateAddress}from'../lib/dm';
interface P{onSelectDm:(s:string,o:string)=>void;onStartDm:()=>void;}
export const DmPanel:FC<P>=({onSelectDm,onStartDm})=>{const{pendingReceived,activeDms,pendingSent,totalUnread,acceptRequest,declineRequest,markRead}=useDm();const[c,setC]=useState(false);const h=useCallback((e:typeof activeDms[number])=>{markRead(e.spaceId);onSelectDm(e.spaceId,e.otherPk);},[markRead,onSelectDm]);
return<div className="dm-panel"><div className="dm-panel-header" onClick={()=>setC(!c)} role="button" tabIndex={0}><span>Direct Messages{totalUnread>0&&<span className="dm-unread-badge">{totalUnread}</span>}</span><span className={dm-chevron}>?</span></div>
{!c&&<div className="dm-panel-body"><button className="dm-new-btn" onClick={onStartDm}>+ New DM</button>
{pendingReceived.map(e=><div key={e.otherPk} className="dm-request-item"><span>{truncateAddress(e.otherPk)}</span><div><button className="dm-accept-btn" onClick={()=>acceptRequest(e.spaceId,e.otherPk)}>?</button><button className="dm-decline-btn" onClick={()=>declineRequest(e.spaceId,e.otherPk)}>?</button></div></div>)}
{activeDms.map(e=><div key={e.otherPk} className={'dm-conv-item'+(e.unreadCount>0?' dm-unread':'')} onClick={()=>h(e)} role="button" tabIndex={0}><span>{truncateAddress(e.otherPk)}{e.unreadCount>0&&<span className="dm-unread-dot"/>}</span></div>)}
{pendingSent.map(e=><div key={e.otherPk} className="dm-conv-item dm-pending"><span>{truncateAddress(e.otherPk)}<em> Pending</em></span></div>)}
{!pendingReceived.length&&!activeDms.length&&!pendingSent.length&&<div className="dm-empty">No DMs yet</div>}
</div>}</div>;};
