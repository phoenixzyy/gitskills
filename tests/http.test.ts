import test from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { Store } from '../api/store.ts'
import { makeServer } from '../api/server.ts'

test('HTTP flow persists a customer, followup and ticket, checks errors and local-only boundaries',async()=>{
 const store=new Store(), server=makeServer(store)
 server.listen(0,'127.0.0.1');await once(server,'listening')
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`
 const send=(path:string,data:unknown,method='POST')=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
 try{
  assert.equal((await fetch(base+'/api/health')).status,200)
  const created=await send('/api/customers',{name:'HTTP customer'});assert.equal(created.status,201);const c=await created.json()
  assert.equal((await send(`/api/customers/${c.id}/followups`,{channel:'电话',content:'Real HTTP followup'})).status,201)
  const ticket=await (await send('/api/tickets',{customerId:c.id,title:'HTTP problem',priority:'normal'})).json()
  const moved=await send(`/api/tickets/${ticket.id}/transitions`,{version:1,status:'in_progress',note:'Started'});assert.equal(moved.status,200)
  assert.equal((await send(`/api/tickets/${ticket.id}/transitions`,{version:1,status:'waiting',note:'Stale'})).status,409)
  assert.equal((await send('/api/customers',{name:''})).status,400)
  assert.equal((await send('/api/customers',[])).status,400)
  assert.equal((await fetch(base+'/api/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400)
  assert.equal((await fetch(base+'/api/customers',{method:'POST',body:'text'})).status,415)
  assert.equal((await fetch(base+'/api/workspace',{headers:{Origin:'https://untrusted.example'}})).status,403)
  assert.equal(await new Promise<number | undefined>((resolve,reject)=>{const req=request(base+'/api/workspace',{headers:{Host:'untrusted.example'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end()}),403)
  assert.equal((await send('/api/customers',{name:'x'.repeat(40000)})).status,413)
  assert.equal((await fetch(base+'/api/missing')).status,404)
  const workspace=await (await fetch(base+'/api/workspace')).json();assert.equal(workspace.customers.length,1);assert.equal(workspace.followups.length,1);assert.equal(workspace.tickets[0].status,'in_progress');assert.equal(workspace.events.length,2)
  const html=await fetch(base+'/');assert.equal(html.status,200);assert.match(await html.text(),/Customer Desk/);assert.match(html.headers.get('Content-Security-Policy')!,/frame-ancestors 'none'/)
  assert.equal((await fetch(base+'/api/store.ts')).status,404)
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close()}
})
