import { checkSemantics, drift } from './semantics/core.mjs';
const args=process.argv.slice(2);
if(args.length) {
  if(args.length!==4 || args[0]!=='--from' || args[2]!=='--commit')throw new Error('usage: check-semantics.mjs [--from upstream-git-repository --commit full-sha]');
  const report=drift(process.cwd(),args[1],args[3]);console.log(JSON.stringify(report,null,2));
  if(report.status==='needs-review')process.exitCode=3;
} else console.log(JSON.stringify(checkSemantics(process.cwd()),null,2));
