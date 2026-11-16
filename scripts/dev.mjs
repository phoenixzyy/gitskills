import { context } from 'esbuild'
import { mkdir, copyFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
await mkdir('dist/assets',{recursive:true}); await copyFile('index.html','dist/index.html')
const builder = await context({entryPoints:['src/main.tsx'],bundle:true,outfile:'dist/assets/app.js',platform:'browser',format:'esm',target:['es2022'],jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})
await builder.rebuild(); await builder.watch()
const server = spawn(process.execPath,['--watch','api/server.ts'],{stdio:'inherit'})
console.log('Watching source files. Refresh the browser after a frontend edit.')
let stopping = false
async function stop(){ if(stopping)return;stopping=true;server.kill('SIGTERM');await builder.dispose() }
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop)
server.on('exit',async code=>{await stop();process.exitCode=code??0})
