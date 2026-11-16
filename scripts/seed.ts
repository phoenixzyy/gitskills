import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Store } from '../api/store.ts'
const path = resolve(process.env.DB_PATH ?? 'data/customer-desk.db')
mkdirSync(dirname(path),{recursive:true})
const store = new Store(path)
try {
  if(store.workspace().customers.length)throw new Error('Demo seed requires an empty database; existing data was not changed.')
  const a=store.createCustomer({name:'林晓（演示）',company:'青禾设计 · 虚构客户',email:'lin@example.test',phone:''})
  const b=store.createCustomer({name:'陈悦（演示）',company:'北岸工作室 · 虚构客户',email:'chen@example.test',phone:''})
  const c=store.createCustomer({name:'周宁（演示）',company:'远山商贸 · 虚构客户',email:'zhou@example.test',phone:''})
  const at=(hours:number)=>new Date(Date.now()+hours*3600000).toISOString()
  store.addFollowup(a.id,{channel:'电话',content:'演示记录：已了解客户的导出需求，约定提供处理进展。',nextContactAt:at(-2)})
  store.addFollowup(b.id,{channel:'邮件',content:'演示记录：已发送设置说明，等待客户确认。',nextContactAt:at(24)})
  const one=store.createTicket({customerId:a.id,title:'订单报表导出后缺少日期列',description:'演示问题：客户导出的报表中没有显示日期，希望确认字段设置。',priority:'high',dueAt:at(-5)})
  store.transition(one.id,{version:one.version,status:'in_progress',note:'已确认问题范围，正在检查导出字段。'})
  const two=store.createTicket({customerId:b.id,title:'协助更新开票抬头信息',description:'演示问题：客户需要了解资料修改流程。',priority:'normal',dueAt:at(30)})
  const progress=store.transition(two.id,{version:two.version,status:'in_progress',note:'已接收请求。'})
  store.transition(two.id,{version:progress.version,status:'waiting',note:'已发送资料清单，等待客户回复。'})
  store.createTicket({customerId:c.id,title:'新增账号的使用说明咨询',description:'演示问题：需要提供首次使用的操作指引。',priority:'low',dueAt:at(72)})
  console.log('Created fictional demo customers and tickets. No real contact details used.')
} finally {store.close()}
