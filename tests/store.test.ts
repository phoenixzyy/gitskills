import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store, AppError } from '../api/store.ts'
import { isOverdue, nextContact } from '../src/domain.ts'
function setup() {const s=new Store(); const c=s.createCustomer({name:'Test customer',email:'test@example.test'});return {s,c}}
const fails=(code:number)=> (e:unknown)=>e instanceof AppError && e.status===code

test('customer validation rejects missing names, invalid emails and non-string fields',()=>{
  const s=new Store();try{assert.throws(()=>s.createCustomer({name:'  '}),fails(400));assert.throws(()=>s.createCustomer({name:'Valid',email:'no-address'}),fails(400));assert.throws(()=>s.createCustomer({name:7}),fails(400));assert.equal(s.workspace().customers.length,0)}finally{s.close()}
})
test('customer edits persist and reject an outdated version',()=>{
  const {s,c}=setup();try{const updated=s.updateCustomer(c.id,{name:'New name',company:'Company',version:1});assert.equal(updated.version,2);assert.throws(()=>s.updateCustomer(c.id,{name:'Overwrite',version:1}),fails(409));assert.equal(s.customer(c.id).name,'New name')}finally{s.close()}
})
test('followups require a real customer and valid channel, keep history and clear plans',()=>{
 const {s,c}=setup();try{assert.throws(()=>s.addFollowup('missing',{channel:'电话',content:'Hello'}),fails(404));assert.throws(()=>s.addFollowup(c.id,{channel:'invalid',content:'Hello'}),fails(400));const f=s.addFollowup(c.id,{channel:'电话',content:'  First call  ',nextContactAt:'2030-02-03T10:00:00.000Z'});assert.equal(f.content,'First call');s.addFollowup(c.id,{channel:'邮件',content:'No next call'});assert.equal(s.workspace().followups.length,2);assert.equal(nextContact(c.id,s.workspace().followups),null)}finally{s.close()}
})
test('invalid calendar dates and priorities are rejected without inserting a ticket',()=>{
 const {s,c}=setup();try{for(const input of [{priority:'unknown'},{priority:'normal',dueAt:'2030-02-30T10:00:00.000Z'},{priority:'normal',title:' '}])assert.throws(()=>s.createTicket({customerId:c.id,title:'Problem',...input}),fails(400));assert.equal(s.workspace().tickets.length,0);assert.equal(s.workspace().events.length,0)}finally{s.close()}
})
test('full ticket lifecycle records reasons, resolves, closes and reopens',()=>{
 const {s,c}=setup();try{let t=s.createTicket({customerId:c.id,title:'Problem',priority:'high'});assert.throws(()=>s.transition(t.id,{version:t.version,status:'resolved',note:'Skip'}),fails(409));t=s.transition(t.id,{version:t.version,status:'in_progress',note:'Investigating'});t=s.transition(t.id,{version:t.version,status:'waiting',note:'Need customer input'});assert.throws(()=>s.transition(t.id,{version:t.version,status:'resolved',note:' '}),fails(400));t=s.transition(t.id,{version:t.version,status:'resolved',note:'Configuration corrected'});assert.equal(t.resolution,'Configuration corrected');t=s.transition(t.id,{version:t.version,status:'closed',note:'Customer confirmed'});assert.equal(t.resolution,'Configuration corrected');t=s.transition(t.id,{version:t.version,status:'in_progress',note:'Issue returned'});assert.equal(t.resolution,'');assert.equal(t.version,6);assert.equal(s.workspace().events.length,6)}finally{s.close()}
})
test('stale ticket updates cannot overwrite transitions or append misleading history',()=>{
 const {s,c}=setup();try{const t=s.createTicket({customerId:c.id,title:'Original',priority:'normal'});s.transition(t.id,{version:1,status:'in_progress',note:'Started'});assert.throws(()=>s.updateTicket(t.id,{version:1,title:'Stale',priority:'urgent'}),fails(409));assert.throws(()=>s.transition(t.id,{version:1,status:'waiting',note:'Stale'}),fails(409));assert.equal(s.ticket(t.id).title,'Original');assert.equal(s.workspace().events.length,2)}finally{s.close()}
})
test('ticket edits validate fields, preserve state and leave an audit event',()=>{
 const {s,c}=setup();try{const t=s.createTicket({customerId:c.id,title:'Initial',priority:'normal'});const updated=s.updateTicket(t.id,{version:1,title:'Refined',description:'More context',priority:'urgent',dueAt:'2030-01-01T00:00:00.000Z'});assert.equal(updated.status,'open');assert.equal(updated.priority,'urgent');assert.equal(updated.version,2);assert.equal(s.workspace().events.length,2)}finally{s.close()}
})
test('audit insertion failure rolls back the ticket change atomically',()=>{
 const {s,c}=setup();try{const t=s.createTicket({customerId:c.id,title:'Atomic',priority:'normal'});s.db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON ticket_events BEGIN SELECT RAISE(ABORT,'forced test failure'); END;");assert.throws(()=>s.transition(t.id,{version:1,status:'in_progress',note:'Start'}));assert.equal(s.ticket(t.id).status,'open');assert.equal(s.ticket(t.id).version,1);assert.equal(s.workspace().events.length,1)}finally{s.close()}
})
test('ticket creation rolls back when initial audit insertion fails',()=>{
 const {s,c}=setup();try{s.db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON ticket_events BEGIN SELECT RAISE(ABORT,'forced test failure'); END;");assert.throws(()=>s.createTicket({customerId:c.id,title:'Atomic',priority:'normal'}));assert.equal(s.workspace().tickets.length,0)}finally{s.close()}
})
test('SQLite foreign keys prevent orphan records',()=>{
 const {s}=setup();try{assert.throws(()=>s.db.prepare('INSERT INTO followups VALUES (?,?,?,?,?,?)').run('note','missing','Text','电话',null,new Date().toISOString()))}finally{s.close()}
})
test('database data survives close and reopen',()=>{
 const dir=mkdtempSync(join(tmpdir(),'customer-desk-'));const path=join(dir,'test.db');let s=new Store(path)
 try{const c=s.createCustomer({name:'Persistent'});s.createTicket({customerId:c.id,title:'Survives restart',priority:'normal'});s.close();s=new Store(path);assert.equal(s.workspace().customers[0].name,'Persistent');assert.equal(s.workspace().tickets.length,1);assert.equal(s.workspace().events.length,1)}finally{s.close();rmSync(dir,{recursive:true,force:true})}
})
test('overdue boundary excludes resolved and closed tickets',()=>{
 const {s,c}=setup();try{const t=s.createTicket({customerId:c.id,title:'Due',priority:'normal',dueAt:'2030-01-01T00:00:00.000Z'});const now=Date.parse(t.dueAt!);assert.equal(isOverdue(t,now),false);assert.equal(isOverdue(t,now+1),true);assert.equal(isOverdue({...t,status:'resolved'},now+1),false);assert.equal(isOverdue({...t,status:'closed'},now+1),false)}finally{s.close()}
})
test('SQL-like user content stays text and does not alter schema',()=>{
 const s=new Store();try{const name="Robert'); DROP TABLE customers;--";assert.equal(s.createCustomer({name}).name,name);assert.equal(s.workspace().customers.length,1)}finally{s.close()}
})
