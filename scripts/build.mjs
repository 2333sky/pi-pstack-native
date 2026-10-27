import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
rmSync('dist',{recursive:true,force:true});
const result=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.build.json'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status ?? 1);
function copy(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())copy(path);else if(entry.name.endsWith('.mjs')){const rel=relative('src',path),out=join('dist',rel);mkdirSync(dirname(out),{recursive:true});if(rel===join('runner','cli.mjs')){writeFileSync(out,readFileSync(path,'utf8').replace(/\.ts(['"])/g,'.js$1'));chmodSync(out,0o755);}else copyFileSync(path,out);}}}
copy('src');
function declarations(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())declarations(path);else if(path.endsWith('.d.ts'))writeFileSync(path,readFileSync(path,'utf8').replace(/\.ts(['"])/g,'.js$1'));}}
declarations('dist');console.log('JavaScript runtime and declarations built.');
