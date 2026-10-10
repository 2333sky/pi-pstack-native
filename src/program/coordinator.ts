import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { WorkflowRunSpec } from '../runtime/types.ts';
import type { WorkflowEngine } from '../workflow/engine.ts';
import { protocol, transact, uid, hash } from '../runtime/protocol.ts';
export interface Unit {key:string;spec:WorkflowRunSpec;workflowId?:string;state:'pending'|'running'|'needs-verify'|'blocked'|'failed'|'ready-to-integrate'|'reconciled';ledgerRefs:string[]}
export interface Program {id:string;owner:string;revision:number;state:'pilot'|'scaling'|'paused'|'blocked'|'completed';maxConcurrency:number;units:Unit[];inbox:{id:string;key:string;state:Unit['state'];processed:boolean}[];orders?:{revision:number;instructions:string[];digest:string};completionPredicate:'all-units-verified';createdAt:string}
export class ProgramCoordinator {
  private workflows: WorkflowEngine;
  constructor(workflows:WorkflowEngine) { this.workflows=workflows; }
  create(owner:string, specs:{key:string;spec:WorkflowRunSpec}[],maxConcurrency=4):Program {
    if(!specs.length || new Set(specs.map(s=>s.key)).size!==specs.length)throw new Error('INVALID_UNITS');
    if(specs.some(s=>s.spec.nodes.some(n=>!n.brief || n.brief.contractLevel!=='strict')))throw new Error('PROGRAM_REQUIRES_STRICT_BRIEFS');
    const p:Program={id:uid('program'),owner,revision:0,state:'pilot',maxConcurrency:Math.max(1,Math.min(16,maxConcurrency)),units:specs.map(s=>({...s,state:'pending',ledgerRefs:[]})),inbox:[],completionPredicate:'all-units-verified',createdAt:new Date().toISOString()};
    return transact('program-created',p.id,owner,s=>{s.programs[p.id]=p;return p;});
  }
  get(id:string,owner:string):Program {const p=protocol().programs[id] as Program;if(!p || p.owner!==owner)throw new Error('PROGRAM_NOT_FOUND');return p;}
  async run(id:string,ctx:ExtensionContext):Promise<Program> {
    const owner=ctx.sessionManager.getSessionId();const p=this.get(id,owner);
    if(p.state==='paused' || p.state==='completed')return p;
    const runUnit=async(key:string)=>{
      let unit=this.get(id,owner).units.find(u=>u.key===key)!;
      if(!unit.workflowId) {
        const currentProgram=this.get(id,owner);
        const wf=this.workflows.create({...unit.spec,nodes:unit.spec.nodes.map(n=>({...n,brief:n.brief && currentProgram.orders?{...n.brief,id:`${n.brief.id}.${currentProgram.id}.${unit.key}`,revision:1,standingOrders:currentProgram.orders.instructions}:n.brief})),parentSessionId:owner,contractLevel:'strict'});
        transact('unit-dispatched',id,owner,s=>{const u=s.programs[id].units.find((x:Unit)=>x.key===key);u.workflowId=wf.id;u.state='running';return {key,workflowId:wf.id};});
        unit=this.get(id,owner).units.find(u=>u.key===key)!;
      }
      const wf=await this.workflows.run(unit.workflowId!,ctx);
      transact('unit-completion',id,owner,s=>{
        const program=s.programs[id] as Program;const u=program.units.find(x=>x.key===key)!;
        u.ledgerRefs=Object.values(wf.calls).flatMap(c=>c.verification?.ledgerId ?? []);
        u.state=wf.state==='failed' || wf.state==='cancelled'?'failed':this.workflows.acceptedWorkflow(wf)?'ready-to-integrate':'blocked';
        program.inbox.push({id:uid('inbox'),key,state:u.state,processed:false});program.revision++;
        return {key,state:u.state};
      });
    };
    if(p.state==='pilot') {
      await runUnit(p.units[0].key);
      const pilot=this.get(id,owner).units[0];
      transact('pilot-settled',id,owner,s=>{s.programs[id].state=pilot.state==='ready-to-integrate'?'scaling':'blocked';return {state:s.programs[id].state};});
      if(pilot.state!=='ready-to-integrate')return this.get(id,owner);
    }
    const active=new Map<string,Promise<void>>();
    while(true) {
      const current=this.get(id,owner);if(current.state==='paused'){await Promise.all(active.values());return this.get(id,owner);}
      for(const unit of current.units) {
        if(active.size>=current.maxConcurrency)break;
        if(!['pending','running','blocked'].includes(unit.state) || active.has(unit.key))continue;
        const promise=runUnit(unit.key).finally(()=>active.delete(unit.key));active.set(unit.key,promise);
      }
      if(!active.size)break;
      await Promise.race(active.values());
      if(this.get(id,owner).units.some(u=>u.state==='blocked' || u.state==='failed')) {await Promise.all(active.values());break;}
    }
    return this.drain(id,owner);
  }
  drain(id:string,owner:string):Program {
    this.get(id,owner);
    return transact('inbox-drained',id,owner,s=>{const p=s.programs[id] as Program;for(const e of p.inbox){if(e.processed)continue;e.processed=true;const u=p.units.find(u=>u.key===e.key)!;if(u.state==='ready-to-integrate')u.state='reconciled';}p.revision++;return p;});
  }
  close(id:string,owner:string):Program {
    const p=this.get(id,owner);
    const failures=p.units.filter(u=>{const wf=u.workflowId?this.workflows.get(u.workflowId):undefined;return u.state!=='reconciled' || !wf || !this.workflows.acceptedWorkflow(wf);});
    if(failures.length)throw new Error(`PROGRAM_CLOSE_BLOCKED: ${failures.map(u=>u.key).join(',')}`);
    return transact('program-closed',id,owner,s=>{s.programs[id].state='completed';return s.programs[id];});
  }
  updateOrders(id:string,owner:string,instructions:string[],reason:string):Program {
    this.get(id,owner);if(!reason.trim() || !instructions.length || instructions.some(x=>typeof x!=='string'))throw new Error('INVALID_STANDING_ORDERS');
    return transact('program-orders-revised',id,owner,s=>{const p=s.programs[id] as Program;p.orders={revision:(p.orders?.revision ?? 0)+1,instructions,digest:hash(instructions)};p.revision++;return { ...p, reason };});
  }
  resume(id:string,owner:string):Program {
    const p=this.get(id,owner);if(!['paused','blocked'].includes(p.state))throw new Error('PROGRAM_NOT_RESUMABLE');
    return transact('program-resumed',id,owner,s=>{const p=s.programs[id] as Program;p.state=['ready-to-integrate','reconciled'].includes(p.units[0].state)?'scaling':'pilot';return p;});
  }
  pause(id:string,owner:string):Program {this.get(id,owner);return transact('program-paused',id,owner,s=>{s.programs[id].state='paused';return s.programs[id];});}
}
