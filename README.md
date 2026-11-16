# 知客 · Customer Desk

An original, local-first customer follow-up and support-ticket application built with React, TypeScript and SQLite. Chinese UI; English project documentation; [中文学习指南](docs/LEARNING.zh-CN.md).

This application was authored with AI assistance in 2026 in the existing `phoenixzyy/gitskills` repository. It is **not a fork or a copied upstream application**. The original 2016 initial commit remains in history; it does not represent the creation date of this application.

## What works

- Create and edit customers, record contact details and chronological follow-ups.
- Plan the next contact; the latest follow-up may explicitly clear an earlier plan.
- Create and edit tickets with customer, priority, due date and description.
- Move tickets through open → in progress → waiting/resolved → closed, with documented reopen paths. Every transition requires a reason.
- Review ticket history, filter/search tickets and identify active overdue work.
- Persist data in SQLite. Optimistic versions reject stale edits with HTTP 409; ticket changes and their history entries commit atomically.
- Accessible form labels, native dialogs, error/retry states and responsive layouts.

## Run locally

Requires Node.js **24**, npm and a modern browser. No database service, cloud account or API key is needed.

```sh
npm ci
npm run check
npm run build
npm test
# Optional: fictional examples; refuses a non-empty database
npm run seed:demo
npm start
```

Open `http://127.0.0.1:3030`. `npm run dev` watches builds and the server; manually refresh the browser after frontend changes. `DB_PATH` changes the SQLite path; `PORT` changes the listening port. Run commands from the repository root. The default database is `data/customer-desk.db`, excluded from Git. Stop the server before backing up the database; retain associated SQLite WAL files if copying a running database.

## Structure and rules

| Location | Responsibility |
| --- | --- |
| `src/domain.ts` | Shared types, allowed transitions and overdue/next-contact calculations |
| `src/App.tsx`, `src/styles.css` | React UI and original styling |
| `api/store.ts` | Validation, SQLite schema, transactions and version checks |
| `api/server.ts` | HTTP API and built static files, bound to loopback |
| `tests/` | Store, actual HTTP and simulated DOM interaction tests |
| `scripts/` | Build, development and fictional data helpers |

Dates are exchanged as UTC ISO strings and displayed in browser local time. Resolved and closed tickets do not count as overdue. A resolution reason is retained on closing and cleared on reopening. Follow-ups are append-only. Ticket audit events are an application history, not a tamper-proof compliance log.

## Validation

Locally verified: offline clean dependency installation, strict TypeScript check, production build, **14 Node tests and 4 UI tests**, plus independent startup and demo-data persistence. HTTP tests use an actual loopback server; UI tests use jsdom and mocked API responses. Native dialog focus trapping, visual appearance and full browser end-to-end behavior are not certified by these tests. The GitHub workflow runs installation, type checks, build and tests; it does not deploy anything.

## Limits

This is a small, single-operator local workspace, **not a hosted multi-user CRM**. It has no authentication, roles, attachments, email delivery or background reminders. Follow-up and overdue indicators are computed in the app. Local processes can access its API. Loopback binding, Host/Origin checks and a restrictive CSP reduce browser-origin exposure but do not replace authentication. Do not expose it through a public proxy.

The API loads the workspace in one response; pagination and large-data performance have not been implemented or benchmarked. SQLite schema version 1 is initialized automatically; future schema changes will need explicit migrations. No deletion UI is provided. Resolve version conflicts by closing the dialog, refreshing and reapplying the edit. Keep backups for any real data.

## License and attribution

Original application code: MIT, copyright 2026 phoenixzyy. Third-party dependencies retain their own licenses; `package-lock.json` records exact dependency versions. No prior employer/customer data or private credentials are included. All seed examples are fictional. See [LICENSE](LICENSE) and [project progress](PORTFOLIO_PROGRESS.md).
