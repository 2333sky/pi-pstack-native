import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { evaluateRound, requireCapability, selectPlaybook, validatePanel } from './adapter.ts';
import { loadModels } from '../runtime/config.ts';
import { resolveRoleModel, selectJudgeFromPool } from '../models/router.ts';
export function registerSemanticTool(pi: ExtensionAPI) {
  pi.registerTool({
    name:'pstack_semantics', label:'Pstack semantic adapter',
    description:'Check capability mappings, route intents, preflight model panels and validate exact-head/base round receipts. For action panel, omit models to resolve the arena, architect or interrogate panel configured by /setup-pstack. Does not execute workflows, attest evidence or authorize merge.',
    parameters:{type:'object',properties:{action:{type:'string',enum:['capability','route','panel','round']},name:{type:'string'},models:{type:'array',items:{type:'string'}},judge:{type:'string'},round:{type:'object',additionalProperties:true}},required:['action'],additionalProperties:false} as any,
    async execute(_id, args:any, _signal, _update, ctx) {
      let result;
      switch(args.action) {
        case 'capability': result=requireCapability(args.name); break;
        case 'route': result={playbook:selectPlaybook(args.name)}; break;
        case 'panel': {
          if (args.models) { result=validatePanel(args.name,args.models,args.judge); break; }
          if (!['architect','arena','interrogate','swarm'].includes(args.name)) throw new Error('UNMAPPED_PANEL');
          const config=loadModels();
          const selectors=args.name === 'swarm' ? [config.workflows?.swarm?.worker ?? config.roles.worker ?? 'inherit-parent'] : config.panels?.[args.name];
          if (!Array.isArray(selectors) || !selectors.length || selectors.length > 16) throw new Error(`PANEL_NOT_CONFIGURED: ${args.name}. Run /setup-pstack.`);
          const notes:string[]=[];
          const resolve=(selector:string) => {
            const resolved=resolveRoleModel(ctx,args.name,selector);
            notes.push(...resolved.notes);
            const model=resolved.model;
            if (!model) throw new Error(`PARENT_MODEL_UNAVAILABLE: ${selector}`);
            return `${model.provider}/${model.id}`;
          };
          const models=selectors.map(resolve);
          let judge=args.judge ? resolve(args.judge) : undefined;
          if (!judge && ['arena','architect'].includes(args.name)) {
            const pool=config.panels?.['arena-judges'];
            if (!Array.isArray(pool) || !pool.length || pool.length > 16) throw new Error('PANEL_NOT_CONFIGURED: arena-judges. Run /setup-pstack.');
            const selection=selectJudgeFromPool(ctx,pool);
            notes.push(...selection.notes);
            judge=selection.model;
          }
          result={...validatePanel(args.name,models,judge,{independentJudgeSession:true,allowRepeatedModels:true,allowSingleInterrogate:true}),selectors,notes,availability:'registered-in-current-session',authentication:'not-checked'};
          break;
        }
        case 'round': result=evaluateRound(args.round); break;
        default: throw new Error('UNMAPPED_SEMANTIC_ACTION');
      }
      return {content:[{type:'text' as const,text:JSON.stringify(result,null,2)}],details:result};
    },
  });
}
