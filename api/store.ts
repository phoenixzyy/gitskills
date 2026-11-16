import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { states, transitions, priorityLabels } from '../src/domain.ts'
import type { Customer, Followup, Ticket, TicketEvent, State, Priority, Workspace } from '../src/domain.ts'

export class AppError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
export type Input = Record<string, unknown>
function text(input: Input, key: string, max: number, required = false): string {
  const value = input[key] ?? ''
  if (typeof value !== 'string') throw new AppError(400, `${key} 必须是文字`)
  const result = value.trim()
  if ((required && !result) || result.length > max) throw new AppError(400, `${key} 不能为空或超过 ${max} 个字符`)
  return result
}
function date(input: Input, key: string): string | null {
  const value = input[key]
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new AppError(400, `${key} 必须是 UTC 时间`)
  const d = new Date(value)
  if (!Number.isFinite(d.getTime()) || d.toISOString() !== value) throw new AppError(400, `${key} 时间无效`)
  return value
}
function version(input: Input): number {
  if (!Number.isSafeInteger(input.version) || (input.version as number) < 1) throw new AppError(400, '缺少有效版本号，请刷新后重试')
  return input.version as number
}
export class Store {
  db: DatabaseSync
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, company TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS followups (
        id TEXT PRIMARY KEY, customerId TEXT NOT NULL REFERENCES customers(id), content TEXT NOT NULL,
        channel TEXT NOT NULL, nextContactAt TEXT, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY, customerId TEXT NOT NULL REFERENCES customers(id), title TEXT NOT NULL, description TEXT NOT NULL,
        priority TEXT NOT NULL CHECK(priority IN ('low','normal','high','urgent')),
        status TEXT NOT NULL CHECK(status IN ('open','in_progress','waiting','resolved','closed')),
        dueAt TEXT, resolution TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ticket_events (
        id TEXT PRIMARY KEY, ticketId TEXT NOT NULL REFERENCES tickets(id), fromStatus TEXT, toStatus TEXT NOT NULL,
        note TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS followups_customer ON followups(customerId, createdAt);
      CREATE INDEX IF NOT EXISTS tickets_customer ON tickets(customerId);
      CREATE INDEX IF NOT EXISTS events_ticket ON ticket_events(ticketId, createdAt);
      PRAGMA user_version = 1;`)
  }
  close() { this.db.close() }
  workspace(): Workspace {
    return {
      customers: this.db.prepare('SELECT * FROM customers ORDER BY createdAt DESC, rowid DESC').all() as unknown as Customer[],
      followups: this.db.prepare('SELECT * FROM followups ORDER BY createdAt DESC, rowid DESC').all() as unknown as Followup[],
      tickets: this.db.prepare('SELECT * FROM tickets ORDER BY createdAt DESC, rowid DESC').all() as unknown as Ticket[],
      events: this.db.prepare('SELECT * FROM ticket_events ORDER BY createdAt DESC, rowid DESC').all() as unknown as TicketEvent[],
    }
  }
  customer(id: string): Customer {
    const row = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
    if (!row) throw new AppError(404, '客户不存在')
    return row as unknown as Customer
  }
  ticket(id: string): Ticket {
    const row = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
    if (!row) throw new AppError(404, '工单不存在')
    return row as unknown as Ticket
  }
  private customerFields(input: Input) {
    const name = text(input, 'name', 100, true), company = text(input, 'company', 120)
    const email = text(input, 'email', 254), phone = text(input, 'phone', 40)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, '邮箱格式不正确')
    return { name, company, email, phone }
  }
  createCustomer(input: Input): Customer {
    const f = this.customerFields(input), id = randomUUID(), now = new Date().toISOString()
    this.db.prepare('INSERT INTO customers (id,name,company,email,phone,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)').run(id,f.name,f.company,f.email,f.phone,now,now)
    return this.customer(id)
  }
  updateCustomer(id: string, input: Input): Customer {
    this.customer(id)
    const f = this.customerFields(input), expected = version(input)
    const result = this.db.prepare('UPDATE customers SET name=?,company=?,email=?,phone=?,version=version+1,updatedAt=? WHERE id=? AND version=?').run(f.name,f.company,f.email,f.phone,new Date().toISOString(),id,expected)
    if (!result.changes) throw new AppError(409, '客户资料已更新，请刷新后重试')
    return this.customer(id)
  }
  addFollowup(customerId: string, input: Input): Followup {
    this.customer(customerId)
    const content = text(input, 'content', 4000, true), channel = text(input, 'channel', 20, true)
    if (!['电话','邮件','会议','在线沟通','其他'].includes(channel)) throw new AppError(400, '请选择有效的跟进方式')
    const note = {id: randomUUID(), customerId, content, channel, nextContactAt: date(input, 'nextContactAt'), createdAt: new Date().toISOString()}
    this.db.prepare('INSERT INTO followups VALUES (?,?,?,?,?,?)').run(note.id,customerId,content,channel,note.nextContactAt,note.createdAt)
    return note
  }
  createTicket(input: Input): Ticket {
    const customerId = text(input, 'customerId', 50, true); this.customer(customerId)
    const title = text(input, 'title', 160, true), description = text(input, 'description', 4000)
    const priority = text(input, 'priority', 20, true)
    if (!Object.hasOwn(priorityLabels, priority)) throw new AppError(400, '优先级无效')
    const dueAt = date(input,'dueAt'), id = randomUUID(), now = new Date().toISOString()
    this.transaction(() => {
      this.db.prepare('INSERT INTO tickets (id,customerId,title,description,priority,status,dueAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)').run(id,customerId,title,description,priority,'open',dueAt,now,now)
      this.db.prepare('INSERT INTO ticket_events VALUES (?,?,?,?,?,?)').run(randomUUID(),id,null,'open','创建工单',now)
    })
    return this.ticket(id)
  }
  transition(id: string, input: Input): Ticket {
    const expected = version(input), status = text(input, 'status', 30, true) as State, note = text(input,'note',2000,true)
    if (!states.includes(status)) throw new AppError(400, '状态无效')
    this.transaction(() => {
      const previous = this.ticket(id)
      if (previous.version !== expected) throw new AppError(409, '工单已被更新，请刷新后重试')
      if (!transitions[previous.status].includes(status)) throw new AppError(409, '不允许这样变更状态')
      const now = new Date().toISOString()
      const resolution = status === 'resolved' ? note : status === 'in_progress' ? '' : previous.resolution
      this.db.prepare('UPDATE tickets SET status=?,resolution=?,version=version+1,updatedAt=? WHERE id=?').run(status,resolution,now,id)
      this.db.prepare('INSERT INTO ticket_events VALUES (?,?,?,?,?,?)').run(randomUUID(),id,previous.status,status,note,now)
    })
    return this.ticket(id)
  }
  updateTicket(id: string, input: Input): Ticket {
    this.ticket(id)
    const expected = version(input), title = text(input,'title',160,true), description = text(input,'description',4000)
    const priority = text(input,'priority',20,true) as Priority, dueAt = date(input,'dueAt')
    if (!Object.hasOwn(priorityLabels,priority)) throw new AppError(400,'优先级无效')
    this.transaction(() => {
      const t = this.ticket(id)
      if (t.version !== expected) throw new AppError(409,'工单已被更新，请刷新后重试')
      const now = new Date().toISOString()
      this.db.prepare('UPDATE tickets SET title=?,description=?,priority=?,dueAt=?,version=version+1,updatedAt=? WHERE id=?').run(title,description,priority,dueAt,now,id)
      this.db.prepare('INSERT INTO ticket_events VALUES (?,?,?,?,?,?)').run(randomUUID(),id,t.status,t.status,'修改标题、描述、优先级或截止时间',now)
    })
    return this.ticket(id)
  }
  private transaction(fn: () => void) {
    this.db.exec('BEGIN IMMEDIATE')
    try { fn(); this.db.exec('COMMIT') } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
}
