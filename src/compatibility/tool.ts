import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { evaluateRound, requireCapability, selectPlaybook, validatePanel } from './adapter.ts';
export function registerSemanticTool(pi: ExtensionAPI) {
  pi.registerTool({
    name:'pstack_semantics', label:'Pstack semantic adapter',
    description:'Check explicit upstream-to-Pi capability mappings, route declared intents, preflight model panels and validate independent exact-head/base round receipts. Does not execute workflows, attest supplied evidence or authorize merge.',
    parameters:{type:'object',properties:{action:{type:'string',enum:['capability','route','panel','round']},name:{type:'string'},models:{type:'array',items:{type:'string'}},judge:{type:'string'},round:{type:'object',additionalProperties:true}},required:['action'],additionalProperties:false} as any,
    async execute(_id, args:any) {
      let result;
      switch(args.action) {
        case 'capability': result=requireCapability(args.name); break;
        case 'route': result={playbook:selectPlaybook(args.name)}; break;
        case 'panel': result=validatePanel(args.name,args.models,args.judge); break;
        case 'round': result=evaluateRound(args.round); break;
        default: throw new Error('UNMAPPED_SEMANTIC_ACTION');
      }
      return {content:[{type:'text' as const,text:JSON.stringify(result,null,2)}],details:result};
    },
  });
}
