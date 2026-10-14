import { loadModels } from "../runtime/config.ts";
import type { WorkflowNodeSpec } from '../runtime/types.ts';
import type { TaskBrief, Budget } from '../contracts/types.ts';
import { validateBrief } from '../contracts/brief.ts';
import { validateGraph } from '../workflow/graph.ts';
import { planArtifacts } from '../workflow/artifacts.ts';
export interface TemplateSpec {
  kind:'arena'|'swarm'|'review'|'autopilot-stack'|'autopilot-full'; brief:TaskBrief;
  models:string[]; panel?:string; judgeModel?:string; rubric?:{criterion:string;weight:number}[];
  candidateCount?:number; swarmMode?:'race'|'partition'; slices?:{key:string;task:string;brief:TaskBrief}[];
  independencePolicy?:'different-model'|'different-family'|'explicit-waiver'; modelFamilies?:Record<string,string>; budget?:Budget;
}
export function buildTemplate(t:TemplateSpec):{nodes:WorkflowNodeSpec[];estimatedAgents:number;budget:Budget|undefined;notes:string[];deliveryContract:'local-dag'|'remote-stack-required'} {
  if(t.panel) t={...t,models:loadModels().panels?.[t.panel] ?? []};
  validateBrief(t.brief);if(t.brief.contractLevel!=='strict')throw new Error('TEMPLATE_REQUIRES_STRICT_BRIEF');
  if(!t.models?.length || t.models.some(m=>!m.includes('/') || ['inherit-parent','auto'].includes(m)))throw new Error('EXPLICIT_MODEL_PANEL_REQUIRED');
  const node=(key:string,profile:string,task:string,dependsOn:string[]=[],model?:string,brief=t.brief):WorkflowNodeSpec=>({key,profile,task,dependsOn,model,brief,isolation:['worker'].includes(profile)?'worktree':profile==='integrator'?'shared':'readonly'});
  let nodes:WorkflowNodeSpec[]=[];
  if(t.kind==='review') {
    const reviewers=t.models.map((m,i)=>node(`review-${i+1}`,'reviewer','Review the fixed artifact. Emit findings with evidence locations, severity, reproducible findings, and model identity; do not edit.',[],m,{...t.brief,id:`${t.brief.id}.review-${i+1}`,reportRequirements:{kind:'review'}}));
    nodes=[...reviewers,node('synthesize','synthesizer','Deduplicate findings by evidence, preserve minority reproducible findings. Produce severity and unresolved list.',reviewers.map(n=>n.key),t.judgeModel)];
  } else if(t.kind==='autopilot-stack' || t.kind==='autopilot-full' || t.kind==='swarm' && t.swarmMode==='partition') {
    if(!t.slices?.length)throw new Error('SLICES_REQUIRED');
    const serial=t.kind==='autopilot-stack';
    const workers=t.slices.map((s,i)=>{validateBrief(s.brief);const n=node(s.key,'worker',s.task,serial && i?[t.slices![i-1].key]:[],t.models[i%t.models.length],s.brief); if(serial && i)n.isolation='shared';return n;});
    nodes=[...workers,node('integrate','integrator','Integrate every completed slice. Report completed/total coverage and unresolved slices.',workers.map(n=>n.key),t.models[0],{...t.brief,id:`${t.brief.id}.coverage`,reportRequirements:{kind:'coverage',slices:workers.map(w=>w.key)}}),node('verify','verifier','Audit integrated artifact and deterministic evidence. Default delivery is dry-run.',['integrate'],t.judgeModel)];
  } else {
    if(t.kind==='swarm' && t.swarmMode!=='race')throw new Error('SWARM_MODE_REQUIRED');
    if(!t.rubric?.length || t.rubric.some(r=>!r.criterion || !(r.weight>0)))throw new Error('RUBRIC_REQUIRED');
    const count=t.candidateCount ?? t.models.length;if(!Number.isInteger(count) || count<2 || count>16)throw new Error('INDEPENDENT_CANDIDATES_REQUIRED');
    if(!t.judgeModel)throw new Error('INDEPENDENT_JUDGE_REQUIRED');
    const policy=t.independencePolicy ?? 'different-model';
    if(policy==='different-model' && t.models.includes(t.judgeModel))throw new Error('JUDGE_NOT_INDEPENDENT');
    if(policy==='different-family' && (!t.modelFamilies?.[t.judgeModel] || t.models.some(m=>!t.modelFamilies?.[m] || t.modelFamilies[m]===t.modelFamilies[t.judgeModel!])))throw new Error('MODEL_FAMILY_INDEPENDENCE_UNPROVEN');
    const candidates=Array.from({length:count},(_,i)=>node(`candidate-${i+1}`,'worker',t.brief.goal,[],t.models[i%t.models.length]));
    const judges=candidates.map(c=>node(`judge-${c.key}`,'reviewer',`Evaluate only this candidate using ${JSON.stringify(t.rubric)}. Emit criterion, score, evidence, weaknesses, selectedParts.`,[c.key],t.judgeModel,{...t.brief,id:`${t.brief.id}.${c.key}.evaluation`,reportRequirements:{kind:'evaluation',criteria:t.rubric!.map(r=>r.criterion)}}));
    nodes=[...candidates,...judges,node('select','synthesizer','Select evidence-backed candidate/parts and explain rubric scores.',judges.map(n=>n.key),t.judgeModel,{...t.brief,id:`${t.brief.id}.selection`,reportRequirements:{kind:'selection',candidates:candidates.map(c=>c.key)}}),node('integrate','integrator','Integrate only selected parts and rerun deterministic checks.',['select'],t.models[0]),node('verify','verifier','Audit final combined artifact. Candidate passes cannot prove integrated code.',['integrate'],t.judgeModel)];
  }
  validateGraph(nodes);planArtifacts(nodes);
  return {deliveryContract:t.kind==='autopilot-stack'?'remote-stack-required':'local-dag',nodes,estimatedAgents:nodes.length,budget:t.budget,notes:['Strict deterministic gates run on each artifact. Failed panels are visible; no silent fallback.','Model cost estimate is unknown until provider usage is available.',...(t.kind==='autopilot-stack'?['This DAG prepares local work, not a delivered PR stack. Use pstack-runner stack-plan/stack-open with independently verified linear worktree branches.']:[])]};
}
