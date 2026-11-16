export const states = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const
export type State = typeof states[number]
export const stateLabels: Record<State, string> = { open: '待受理', in_progress: '处理中', waiting: '待客户回复', resolved: '已解决', closed: '已关闭' }
export const transitions: Record<State, readonly State[]> = { open: ['in_progress'], in_progress: ['waiting', 'resolved'], waiting: ['in_progress', 'resolved'], resolved: ['closed', 'in_progress'], closed: ['in_progress'] }
export const priorityLabels = { low: '低', normal: '普通', high: '高', urgent: '紧急' }
export type Priority = keyof typeof priorityLabels
export interface Customer { id: string; name: string; company: string; email: string; phone: string; version: number; createdAt: string; updatedAt: string }
export interface Followup { id: string; customerId: string; content: string; channel: string; nextContactAt: string | null; createdAt: string }
export interface Ticket { id: string; customerId: string; title: string; description: string; priority: Priority; status: State; dueAt: string | null; resolution: string; version: number; createdAt: string; updatedAt: string }
export interface TicketEvent { id: string; ticketId: string; fromStatus: State | null; toStatus: State; note: string; createdAt: string }
export interface Workspace { customers: Customer[]; followups: Followup[]; tickets: Ticket[]; events: TicketEvent[] }
export const isActive = (t: Ticket) => t.status !== 'resolved' && t.status !== 'closed'
export const isOverdue = (t: Ticket, now = Date.now()) => isActive(t) && !!t.dueAt && Date.parse(t.dueAt) < now
export function nextContact(customerId: string, notes: Followup[]): string | null {
  // Newest record supersedes the previous plan, including explicitly clearing it.
  return notes.filter(n => n.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.nextContactAt ?? null
}
