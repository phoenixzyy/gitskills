import { build } from 'esbuild'
import { mkdir, copyFile } from 'node:fs/promises'
await mkdir('dist/assets',{recursive:true})
await build({entryPoints:['src/main.tsx'],bundle:true,minify:true,outfile:'dist/assets/app.js',platform:'browser',format:'esm',target:['es2022'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'})
await copyFile('index.html','dist/index.html')
console.log('Built frontend in dist/')
