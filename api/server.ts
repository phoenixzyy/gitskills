import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { resolve, extname, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store, AppError } from './store.ts'
import type { Input } from './store.ts'

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'})
  res.end(JSON.stringify(data))
}
async function body(req: IncomingMessage): Promise<Input> {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new AppError(415,'请使用 JSON 请求')
  let total = 0; const parts: Buffer[] = []
  for await (const chunk of req.iterator({destroyOnReturn:false})) {
    total += chunk.length
    if (total > 32_768) { req.resume(); throw new AppError(413,'请求内容过长') }
    parts.push(chunk)
  }
  try {
    const value = JSON.parse(Buffer.concat(parts).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value
  } catch { throw new AppError(400,'JSON 格式不正确') }
}
export function makeServer(store: Store, staticDir = resolve('dist')) {
  const root = resolve(staticDir)
  return createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff')
    res.setHeader('Referrer-Policy','no-referrer')
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    try {
      const address = req.socket.localPort
      const hosts = [`127.0.0.1:${address}`,`localhost:${address}`]
      if (!hosts.includes(req.headers.host ?? '')) throw new AppError(403,'仅允许本地访问')
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new AppError(403,'拒绝跨站请求')
      const path = new URL(req.url ?? '/',`http://${req.headers.host}`).pathname
      if (req.method === 'GET' && path === '/api/health') return json(res,200,{status:'ok'})
      if (req.method === 'GET' && path === '/api/workspace') return json(res,200,store.workspace())
      if (req.method === 'POST' && path === '/api/customers') return json(res,201,store.createCustomer(await body(req)))
      let match = path.match(/^\/api\/customers\/([\w-]+)$/)
      if (req.method === 'PUT' && match) return json(res,200,store.updateCustomer(match[1],await body(req)))
      match = path.match(/^\/api\/customers\/([\w-]+)\/followups$/)
      if (req.method === 'POST' && match) return json(res,201,store.addFollowup(match[1],await body(req)))
      if (req.method === 'POST' && path === '/api/tickets') return json(res,201,store.createTicket(await body(req)))
      match = path.match(/^\/api\/tickets\/([\w-]+)\/transitions$/)
      if (req.method === 'POST' && match) return json(res,200,store.transition(match[1],await body(req)))
      match = path.match(/^\/api\/tickets\/([\w-]+)$/)
      if (req.method === 'PUT' && match) return json(res,200,store.updateTicket(match[1],await body(req)))
      if (path.startsWith('/api/')) throw new AppError(404,'接口不存在')
      if (req.method !== 'GET') throw new AppError(405,'请求方法不支持')
      const file = path === '/' ? resolve(root,'index.html') : resolve(root,`.${decodeURIComponent(path)}`)
      if (!file.startsWith(root + sep)) throw new AppError(404,'文件不存在')
      const mime: Record<string,string> = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}
      if (!mime[extname(file)]) throw new AppError(404,'文件不存在')
      const bytes = await readFile(file).catch(() => { throw new AppError(404,'请先运行 npm run build') })
      res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-cache'}); res.end(bytes)
    } catch (error) {
      if (error instanceof AppError) json(res,error.status,{error:error.message})
      else { console.error('Request failed:',error instanceof Error ? error.message : 'unknown'); json(res,500,{error:'服务器处理失败，请重试'}) }
    }
  })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dbPath = resolve(process.env.DB_PATH ?? 'data/customer-desk.db')
  mkdirSync(dirname(dbPath),{recursive:true})
  const store = new Store(dbPath), server = makeServer(store)
  const port = Number(process.env.PORT ?? 3030)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535')
  server.listen(port,'127.0.0.1',() => console.log(`Customer Desk: http://127.0.0.1:${port}`))
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,() => { server.close(() => { store.close(); process.exit(0) }); server.closeIdleConnections() })
}
