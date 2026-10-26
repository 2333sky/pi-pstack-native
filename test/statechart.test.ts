import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
// @ts-ignore bundled upstream implementation
import {parseMermaid} from '../skills/statechart/scripts/lib.mjs';
test('statechart: bundled CLI is discoverable and preserves composite transitions',()=>{
 const result=spawnSync(process.execPath,['skills/statechart/scripts/statechart.mjs','--help'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/from-spec/);assert.match(result.stdout,/from-chart/);
 const model=parseMermaid('stateDiagram-v2\nstate Running {\n [*] --> Waiting\n Waiting --> Done: finish\n}\n[*] --> Running\nRunning --> Stopped: cancel\n');
 const transitions=model.regions.Main.transitions;
 assert.ok(transitions.some((t:any)=>t.from==='Running.Waiting' && t.to==='Stopped' && t.label==='cancel'));
 assert.ok(transitions.some((t:any)=>t.from==='Running.Done' && t.to==='Stopped' && t.label==='cancel'));
});
