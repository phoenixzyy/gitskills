import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
await mkdir('.test-ui',{recursive:true})
await build({entryPoints:['src/App.tsx'],outfile:'.test-ui/App.mjs',bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic'})
const result=spawnSync(process.execPath,['--test','tests/ui.test.mjs'],{stdio:'inherit',env:{...process.env,NODE_ENV:'test'}})
process.exitCode=result.status??1
