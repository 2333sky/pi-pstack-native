import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
// @ts-ignore bundled upstream implementation
import {parseMermaid} from '../skills/statechart/scripts/lib.mjs';
import { parseDot } from '../skills/statechart/scripts/frontends/dot.ts';
test('statechart: bundled CLI is discoverable and preserves composite transitions',()=>{
 const result=spawnSync(process.execPath,['skills/statechart/scripts/statechart.mjs','--help'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/from-spec/);assert.match(result.stdout,/from-chart/);
 const model=parseMermaid('stateDiagram-v2\nstate Running {\n [*] --> Waiting\n Waiting --> Done: finish\n}\n[*] --> Running\nRunning --> Stopped: cancel\n');
 const transitions=model.regions.Main.transitions;
 assert.ok(transitions.some((t:any)=>t.from==='Running.Waiting' && t.to==='Stopped' && t.label==='cancel'));
 assert.ok(transitions.some((t:any)=>t.from==='Running.Done' && t.to==='Stopped' && t.label==='cancel'));
});

test('statechart 0.15.36: TypeScript CLI and DOT parser are available',()=>{
 const result=spawnSync(process.execPath,['--disable-warning=ExperimentalWarning','skills/statechart/scripts/statechart.ts'],{encoding:'utf8'});
 assert.equal(result.status,2,result.stderr);assert.match(result.stderr,/Usage: statechart SPEC\.tla/);
 const graph=parseDot('digraph states {\n  1 [label="/\\ phase = \\"ready\\""];\n}\n');
 assert.ok(graph);
 const installed=spawnSync(process.execPath,['dist/statechart/statechart.js'],{encoding:'utf8'});
 assert.equal(installed.status,2,installed.stderr);assert.match(installed.stderr,/Usage: statechart SPEC\.tla/);
 const build=spawnSync(process.execPath,['scripts/build-statechart.mjs','--check'],{encoding:'utf8'});
 assert.equal(build.status,0,build.stderr);
});
