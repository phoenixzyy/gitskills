import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { isActive, isOverdue, nextContact, priorityLabels, stateLabels, states, transitions } from './domain'
import type { Customer, Priority, State, Ticket, Workspace } from './domain'

type Modal = {kind:'customer'; item?:Customer} | {kind:'ticket'; item?:Ticket} | {kind:'followup'; customer:Customer} | {kind:'transition'; ticket:Ticket; target:State}
const empty: Workspace = {customers:[], tickets:[], followups:[], events:[]}
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '未设置'
const localInput = (value?: string | null) => value ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0,16) : ''
const utc = (value: FormDataEntryValue | null) => value ? new Date(String(value)).toISOString() : null
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(path,{method,headers:body ? {'Content-Type':'application/json'} : {},body:body ? JSON.stringify(body) : undefined})
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || '请求失败')
  return result
}
function Badge({status}: {status:State}) { return <span className={`badge ${status}`}><i />{stateLabels[status]}</span> }
function Field({label,children}: {label:string; children:ReactNode}) { return <label className="field"><span>{label}</span>{children}</label> }
function Dialog({modal,customers,onClose,onSave}: {modal:Modal;customers:Customer[];onClose:()=>void;onSave:(path:string,method:string,body:unknown)=>Promise<void>}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [error,setError] = useState(''), [busy,setBusy] = useState(false)
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() },[])
  const item = 'item' in modal ? modal.item : undefined
  const title = modal.kind === 'customer' ? item ? '编辑客户资料' : '新增客户' : modal.kind === 'ticket' ? item ? '编辑工单' : '创建售后工单' : modal.kind === 'followup' ? `跟进 · ${modal.customer.name}` : `${stateLabels[modal.target]} · 工单`
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    const f = new FormData(event.currentTarget), data = Object.fromEntries(f)
    try {
      if (modal.kind === 'customer') await onSave(modal.item ? `/api/customers/${modal.item.id}` : '/api/customers',modal.item ? 'PUT' : 'POST',{...data,version:modal.item?.version})
      if (modal.kind === 'ticket') await onSave(modal.item ? `/api/tickets/${modal.item.id}` : '/api/tickets',modal.item ? 'PUT' : 'POST',{...data,version:modal.item?.version,dueAt:utc(f.get('dueAt'))})
      if (modal.kind === 'followup') await onSave(`/api/customers/${modal.customer.id}/followups`,'POST',{...data,nextContactAt:utc(f.get('nextContactAt'))})
      if (modal.kind === 'transition') await onSave(`/api/tickets/${modal.ticket.id}/transitions`,'POST',{status:modal.target,version:modal.ticket.version,note:f.get('note')})
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); setBusy(false) }
  }
  return <dialog ref={dialog} aria-labelledby="dialog-title" onCancel={e => { if (busy) e.preventDefault(); else onClose() }}>
    <form onSubmit={submit}><header className="dialog-head"><div><span className="eyebrow">CUSTOMER DESK</span><h2 id="dialog-title">{title}</h2></div><button type="button" className="icon-button" aria-label="关闭窗口" onClick={onClose} disabled={busy}>×</button></header>
    <div className="dialog-body">
      {error && <div role="alert" className="notice error">{error}</div>}
      {modal.kind === 'customer' && <>
        <Field label="客户姓名 *"><input name="name" required maxLength={100} defaultValue={modal.item?.name} autoFocus /></Field>
        <Field label="公司 / 团队"><input name="company" maxLength={120} defaultValue={modal.item?.company} /></Field>
        <div className="form-grid"><Field label="邮箱"><input name="email" type="email" maxLength={254} defaultValue={modal.item?.email} /></Field><Field label="电话"><input name="phone" maxLength={40} defaultValue={modal.item?.phone} /></Field></div>
      </>}
      {modal.kind === 'ticket' && <>
        {!modal.item && <Field label="关联客户 *"><select name="customerId" required defaultValue=""><option value="" disabled>选择客户</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.company || '个人客户'}</option>)}</select></Field>}
        <Field label="工单标题 *"><input name="title" required maxLength={160} defaultValue={modal.item?.title} autoFocus /></Field>
        <Field label="问题描述"><textarea name="description" maxLength={4000} rows={4} defaultValue={modal.item?.description} placeholder="记录问题现象、发生时间与期望结果" /></Field>
        <div className="form-grid"><Field label="优先级"><select name="priority" defaultValue={modal.item?.priority || 'normal'}>{Object.entries(priorityLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></Field><Field label="截止时间（本地时间）"><input type="datetime-local" name="dueAt" defaultValue={localInput(modal.item?.dueAt)} /></Field></div>
      </>}
      {modal.kind === 'followup' && <>
        <Field label="沟通方式"><select name="channel">{['电话','邮件','会议','在线沟通','其他'].map(v=><option key={v}>{v}</option>)}</select></Field>
        <Field label="跟进内容 *"><textarea name="content" required maxLength={4000} rows={5} autoFocus placeholder="客户反馈、沟通结果与下一步行动" /></Field>
        <Field label="下次联系时间（本地时间）"><input name="nextContactAt" type="datetime-local" /></Field><p className="help">这条记录会替代之前的联系计划。留空表示本次不安排后续提醒。</p>
      </>}
      {modal.kind === 'transition' && <>
        <p className="transition-preview"><Badge status={modal.ticket.status} /><span>→</span><Badge status={modal.target} /></p>
        <Field label={modal.target === 'resolved' ? '处理结果 *' : '变更说明 *'}><textarea name="note" required maxLength={2000} rows={5} autoFocus placeholder={modal.target === 'resolved' ? '说明问题如何解决，以及客户确认情况' : '说明此次变更的原因与后续行动'} /></Field>
        <p className="help">本次操作将写入工单历史。重新处理中会清除旧的解决摘要，历史记录仍保留。</p>
      </>}
    </div><footer className="dialog-footer"><button type="button" className="secondary" onClick={onClose} disabled={busy}>取消</button><button className="primary" disabled={busy}>{busy ? '保存中…' : '保存'}</button></footer></form>
  </dialog>
}
export default function App() {
  const [data,setData] = useState<Workspace>(empty), [loading,setLoading] = useState(true), [error,setError] = useState(''), [message,setMessage] = useState('')
  const [page,setPage] = useState<'tickets'|'customers'>('tickets'), [search,setSearch] = useState(''), [status,setStatus] = useState(''), [priority,setPriority] = useState(''), [onlyOverdue,setOnlyOverdue] = useState(false)
  const [ticketId,setTicketId] = useState(''), [customerId,setCustomerId] = useState(''), [modal,setModal] = useState<Modal|null>(null), [now,setNow] = useState(Date.now())
  async function reload() { setError(''); setLoading(true); try { setData(await request<Workspace>('/api/workspace')); return true } catch(e) { setError(e instanceof Error ? e.message : '无法连接本地服务'); return false } finally { setLoading(false) } }
  useEffect(()=>{ void reload(); const id = setInterval(()=>setNow(Date.now()),60_000);return ()=>clearInterval(id) },[])
  async function save(path:string,method:string,body:unknown) {
    await request(path,method,body)
    const refreshed = await reload()
    setMessage(refreshed ? '已保存到本地数据库' : '保存成功，但列表刷新失败；请点击刷新，不要重复提交。')
  }
  const customer = (id:string) => data.customers.find(c=>c.id===id)
  const query = search.trim().toLocaleLowerCase()
  const tickets = data.tickets.filter(t=>(!status || t.status === status) && (!priority || t.priority === priority) && (!onlyOverdue || isOverdue(t,now)) && `${t.title} ${customer(t.customerId)?.name} ${customer(t.customerId)?.company} ${t.id}`.toLocaleLowerCase().includes(query))
  const customers = data.customers.filter(c=>`${c.name} ${c.company} ${c.email} ${c.phone}`.toLocaleLowerCase().includes(query))
  const selectedTicket = tickets.find(t=>t.id===ticketId) ?? tickets[0]
  const selectedCustomer = customers.find(c=>c.id===customerId) ?? customers[0]
  const active = data.tickets.filter(isActive).length, overdue = data.tickets.filter(t=>isOverdue(t,now)).length
  const pendingContacts = data.customers.filter(c=>{const next=nextContact(c.id,data.followups);return next && Date.parse(next)<=now})
  function navigate(target:typeof page) {setPage(target);setSearch('');setMessage('')}
  function resetFilters() {setSearch('');setStatus('');setPriority('');setOnlyOverdue(false)}
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="/" aria-label="知客工作台首页"><span className="brand-mark">知</span><span>知客 <small>CUSTOMER DESK</small></span></a>
      <p className="nav-caption">工作空间</p><nav aria-label="主导航"><button className={page==='tickets'?'nav-item active':'nav-item'} onClick={()=>navigate('tickets')}><span aria-hidden="true">▤</span>售后工单<b>{active}</b></button><button className={page==='customers'?'nav-item active':'nav-item'} onClick={()=>navigate('customers')}><span aria-hidden="true">◎</span>客户与跟进<b>{data.customers.length}</b></button></nav>
      <div className="sidebar-note"><span className="local-dot" />本地工作空间<p>资料保存在此电脑的 SQLite 数据库中。</p><small>单人版 · 无云端同步</small></div><div className="profile"><span className="avatar">我</span><div>本地操作员<small>客户服务工作台</small></div></div>
    </aside>
    <main><header className="topbar"><div><span className="breadcrumb">工作空间</span><span className="slash">/</span>{page==='tickets'?'售后工单':'客户与跟进'}</div><div className="topbar-right"><span className="today">{new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'short'}).format(now)}</span><button className="secondary compact" onClick={()=>void reload()} disabled={loading}>{loading?'同步中…':'刷新'}</button></div></header>
      <div className="workspace"><section className="page-heading"><div><p className="eyebrow">RELATIONSHIPS, WELL KEPT.</p><h1>{page==='tickets'?'让每个问题都有回应。':'把每次沟通，接续起来。'}</h1><p className="subtitle">{page==='tickets'?'从受理到解决，清晰掌握每一张工单的进展。':'集中管理客户资料、沟通记录和下一次联系计划。'}</p></div><button className="primary" onClick={()=>setModal(page==='tickets' && data.customers.length ? {kind:'ticket'} : {kind:'customer'})}>＋ {page==='tickets' && data.customers.length ? '创建工单' : '新增客户'}</button></section>
      {error && <div className="notice error" role="alert">{error} <button onClick={()=>void reload()}>重新加载</button></div>}
      {message && <div className="notice success" role="status">{message}<button aria-label="关闭提示" onClick={()=>setMessage('')}>×</button></div>}
      <section className="metrics" aria-label="工作概览"><div className="metric"><span>客户总数</span><strong>{data.customers.length.toString().padStart(2,'0')}</strong><small>已建立的客户档案</small></div><div className="metric"><span>待处理工单</span><strong>{active.toString().padStart(2,'0')}</strong><small>待受理、处理中及等待回复</small></div><div className={`metric ${overdue?'danger':''}`}><span>逾期工单 <i>!</i></span><strong>{overdue.toString().padStart(2,'0')}</strong><small>超过截止时间且尚未解决</small></div><div className="metric"><span>待跟进客户</span><strong>{pendingContacts.length.toString().padStart(2,'0')}</strong><small>已到最新计划联系时间</small></div></section>
      <div className="content-grid"><section className="list-panel"><div className="panel-title"><h2>{page==='tickets'?'工单列表':'客户档案'} <span>{page==='tickets'?tickets.length:customers.length}</span></h2>{page==='customers' && <button className="text-button" onClick={()=>setModal({kind:'customer'})}>＋ 新增客户</button>}</div>
        <div className="filters"><label className="search"><span aria-hidden="true">⌕</span><input aria-label={page==='tickets'?'搜索工单或客户':'搜索客户'} placeholder={page==='tickets'?'搜索工单、客户或公司…':'搜索姓名、公司或联系方式…'} value={search} onChange={e=>setSearch(e.target.value)} /></label>
        {page==='tickets' && <><div className="filter-row"><select aria-label="按状态筛选" value={status} onChange={e=>setStatus(e.target.value)}><option value="">全部状态</option>{states.map(s=><option value={s} key={s}>{stateLabels[s]}</option>)}</select><select aria-label="按优先级筛选" value={priority} onChange={e=>setPriority(e.target.value)}><option value="">全部优先级</option>{Object.entries(priorityLabels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select><button className={`filter-chip ${onlyOverdue?'selected':''}`} aria-pressed={onlyOverdue} onClick={()=>setOnlyOverdue(!onlyOverdue)}>仅看逾期</button></div></>}
        </div>
        {loading && !data.customers.length ? <div className="empty" role="status">正在加载工作空间…</div> : page==='tickets' ? tickets.length ? <div className="table-scroll"><table><thead><tr><th>工单 / 客户</th><th>状态</th><th>截止时间</th></tr></thead><tbody>{tickets.map(t=><tr key={t.id} className={selectedTicket?.id===t.id?'selected-row':''}><td><button className="row-title" onClick={()=>setTicketId(t.id)} aria-pressed={selectedTicket?.id===t.id}>{t.title}</button><div className="row-meta"><span className={`priority-dot ${t.priority}`} />{priorityLabels[t.priority]}<span>·</span>{customer(t.customerId)?.name}</div></td><td><Badge status={t.status} /></td><td className={isOverdue(t,now)?'overdue':'muted'}>{formatDate(t.dueAt)}{isOverdue(t,now)&&<small>已逾期</small>}</td></tr>)}</tbody></table></div> : <div className="empty"><span className="empty-symbol">▤</span><h3>{data.tickets.length?'没有符合条件的工单':'从第一张工单开始'}</h3><p>{data.tickets.length?'调整筛选条件，再试一次。':'先建立客户档案，再记录需要处理的问题。'}</p><button className="secondary" onClick={data.tickets.length?resetFilters:()=>setModal(data.customers.length?{kind:'ticket'}:{kind:'customer'})}>{data.tickets.length?'清除筛选':'开始记录'}</button></div> : customers.length ? <div className="customer-list">{customers.map(c=>{const plan=nextContact(c.id,data.followups);return <button key={c.id} className={`customer-row ${selectedCustomer?.id===c.id?'selected-row':''}`} onClick={()=>setCustomerId(c.id)} aria-pressed={selectedCustomer?.id===c.id}><span className="avatar">{c.name.slice(0,1)}</span><span className="customer-name">{c.name}<small>{c.company||'个人客户'}</small></span><span className={plan&&Date.parse(plan)<=now?'contact-plan overdue':'contact-plan'}>{plan?formatDate(plan):'暂无联系计划'}<small>{data.tickets.filter(t=>t.customerId===c.id&&isActive(t)).length} 张待处理工单</small></span></button>})}</div> : <div className="empty"><span className="empty-symbol">◎</span><h3>{data.customers.length?'没有匹配的客户':'还没有客户档案'}</h3><p>从姓名和联系方式开始，逐步积累服务记录。</p><button className="secondary" onClick={()=>data.customers.length?setSearch(''):setModal({kind:'customer'})}>{data.customers.length?'清除搜索':'新增客户'}</button></div>}
        <footer className="list-footer"><span>数据保存在本地 · 时间按当前设备时区显示</span><span>Customer Desk</span></footer>
      </section>
      <aside className="detail-panel" aria-label={page==='tickets'?'工单详情':'客户详情'}>{page==='tickets' && selectedTicket ? <>
        <div className="detail-head"><p className="eyebrow">工单详情 · {selectedTicket.id.slice(0,8).toUpperCase()}</p><h2>{selectedTicket.title}</h2><Badge status={selectedTicket.status} /></div>
        <div className="detail-body"><dl><div><dt>关联客户</dt><dd><button className="text-button" onClick={()=>{navigate('customers');setCustomerId(selectedTicket.customerId)}}>{customer(selectedTicket.customerId)?.name} ↗</button></dd></div><div><dt>优先级</dt><dd><span className={`priority-dot ${selectedTicket.priority}`} />{priorityLabels[selectedTicket.priority]}</dd></div><div><dt>截止时间</dt><dd className={isOverdue(selectedTicket,now)?'overdue':''}>{formatDate(selectedTicket.dueAt)}</dd></div></dl><p className="description">{selectedTicket.description||'暂无补充描述。'}</p>
        {selectedTicket.resolution && <div className="resolution"><strong>处理结果</strong><p>{selectedTicket.resolution}</p></div>}
        <div className="detail-actions">{transitions[selectedTicket.status].map(s=><button key={s} className={s==='resolved'?'primary small':'secondary small'} onClick={()=>setModal({kind:'transition',ticket:selectedTicket,target:s})}>{s==='in_progress'?(selectedTicket.status==='open'?'开始处理':'重新处理'):stateLabels[s]}</button>)}<button className="text-button" onClick={()=>setModal({kind:'ticket',item:selectedTicket})}>编辑工单</button></div>
        <h3 className="section-label">流转记录</h3><ol className="timeline">{data.events.filter(e=>e.ticketId===selectedTicket.id).map(e=><li key={e.id}><strong>{e.fromStatus===e.toStatus?'更新资料':stateLabels[e.toStatus]}</strong><time dateTime={e.createdAt}>{formatDate(e.createdAt)}</time><p>{e.note}</p></li>)}</ol></div>
      </> : page==='customers' && selectedCustomer ? <><div className="detail-head"><p className="eyebrow">客户详情</p><h2>{selectedCustomer.name}</h2><p className="subtitle">{selectedCustomer.company||'个人客户'}</p></div><div className="detail-body"><dl><div><dt>邮箱</dt><dd>{selectedCustomer.email||'未填写'}</dd></div><div><dt>电话</dt><dd>{selectedCustomer.phone||'未填写'}</dd></div><div><dt>下次联系</dt><dd>{formatDate(nextContact(selectedCustomer.id,data.followups))}</dd></div></dl><div className="detail-actions"><button className="primary small" onClick={()=>setModal({kind:'followup',customer:selectedCustomer})}>＋ 添加跟进</button><button className="text-button" onClick={()=>setModal({kind:'customer',item:selectedCustomer})}>编辑资料</button></div><h3 className="section-label">沟通记录</h3>{data.followups.some(f=>f.customerId===selectedCustomer.id)?<ol className="timeline">{data.followups.filter(f=>f.customerId===selectedCustomer.id).map(f=><li key={f.id}><strong>{f.channel}</strong><time dateTime={f.createdAt}>{formatDate(f.createdAt)}</time><p>{f.content}</p>{f.nextContactAt&&<small>计划联系：{formatDate(f.nextContactAt)}</small>}</li>)}</ol>:<p className="help">暂无跟进记录。记录一次沟通，安排下一步行动。</p>}</div></> : <div className="empty detail-empty"><span className="empty-symbol">↗</span><h3>工作细节，就在这里</h3><p>选择一项记录，查看详情和处理历史。</p></div>}</aside></div>
      <footer className="page-footer">知客 Customer Desk <span>把服务做细，把关系留住。</span></footer>
    </div></main>{modal && <Dialog key={JSON.stringify(modal)} modal={modal} customers={data.customers} onClose={()=>setModal(null)} onSave={save} />}
  </div>
}
