import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'})
for(const key of ['window','document','HTMLElement','HTMLDialogElement','MutationObserver','Event','MouseEvent','FormData','Node'])globalThis[key]=dom.window[key]
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
const React=await import('react')
const {render,screen,fireEvent,waitFor,cleanup}=await import('@testing-library/react')
const {default:App}=await import('../.test-ui/App.mjs')
let data, writes
function mockAPI(){
 data={customers:[],tickets:[],followups:[],events:[]};writes=[]
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/workspace')return {ok:true,json:async()=>structuredClone(data)}
  const body=JSON.parse(options.body);writes.push({path,body})
  if(path==='/api/customers'){data.customers.push({...body,id:'customer-1',version:1,createdAt:new Date().toISOString()});return {ok:true,json:async()=>data.customers[0]}}
  return {ok:false,json:async()=>({error:'模拟保存失败'})}
 }
}
test('empty workspace supports customer creation and updates the customer view',async()=>{
 mockAPI();render(React.createElement(App))
 try{
  await screen.findByText('从第一张工单开始')
  fireEvent.click(screen.getByRole('button',{name:'＋ 新增客户'}))
  fireEvent.change(screen.getByLabelText('客户姓名 *'),{target:{value:'测试客户'}})
  fireEvent.change(screen.getByLabelText('公司 / 团队'),{target:{value:'虚构公司'}})
  fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}))
  await screen.findByText('已保存到本地数据库')
  assert.equal(writes[0].body.name,'测试客户')
  fireEvent.click(screen.getByRole('button',{name:/客户与跟进/}))
  await screen.findByRole('button',{name:/测试客户.*虚构公司/})
  assert.equal(screen.queryByRole('dialog'),null)
 }finally{cleanup()}
})
test('failed writes stay visible in the dialog and never report success',async()=>{
 mockAPI();data.customers.push({id:'customer-1',name:'测试客户',company:'公司',email:'',phone:'',version:1})
 render(React.createElement(App))
 try{
  await screen.findByText('从第一张工单开始')
  fireEvent.click(screen.getByRole('button',{name:'＋ 创建工单'}))
  fireEvent.change(screen.getByLabelText('关联客户 *'),{target:{value:'customer-1'}})
  fireEvent.change(screen.getByLabelText('工单标题 *'),{target:{value:'测试问题'}})
  fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}))
  await screen.findByText('模拟保存失败')
  assert.ok(screen.getByRole('dialog'));assert.equal(screen.queryByText('已保存到本地数据库'),null)
  assert.equal(screen.getByLabelText('工单标题 *').value,'测试问题')
 }finally{cleanup()}
})
test('search and overdue filters narrow the list; clearing restores it',async()=>{
 mockAPI();data.customers.push({id:'customer-1',name:'客户',company:'公司'})
 data.tickets=[{id:'one',customerId:'customer-1',title:'过期问题',status:'open',priority:'high',dueAt:'2000-01-01T00:00:00.000Z',description:'',resolution:'',version:1},{id:'two',customerId:'customer-1',title:'已完成问题',status:'resolved',priority:'normal',dueAt:'2000-01-01T00:00:00.000Z',description:'',resolution:'已处理',version:2}]
 render(React.createElement(App))
 try{
  await screen.findByRole('button',{name:'过期问题'})
  fireEvent.click(screen.getByRole('button',{name:'仅看逾期'}))
  assert.equal(screen.queryByRole('button',{name:'已完成问题'}),null)
  fireEvent.change(screen.getByRole('textbox',{name:'搜索工单或客户'}),{target:{value:'不存在'}})
  await screen.findByText('没有符合条件的工单')
  fireEvent.click(screen.getByRole('button',{name:'清除筛选'}))
  await screen.findByRole('button',{name:'已完成问题'})
 }finally{cleanup()}
})
test('initial API failure exposes retry and recovers without a fake success state',async()=>{
 mockAPI();const goodFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('连接失败')}
 render(React.createElement(App))
 try{
  await screen.findByRole('alert');assert.match(screen.getByRole('alert').textContent,/连接失败/)
  globalThis.fetch=goodFetch;fireEvent.click(screen.getByRole('button',{name:'重新加载'}))
  await waitFor(()=>assert.equal(screen.queryByRole('alert'),null))
 }finally{cleanup()}
})
