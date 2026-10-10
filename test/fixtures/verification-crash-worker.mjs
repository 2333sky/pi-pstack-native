import { verify } from '../../src/verification/runner.ts';
import { fingerprint } from '../../src/artifacts/fingerprint.ts';
const [repo]=process.argv.slice(2);const command=['node','-e','console.log("gate-ready");setInterval(()=>{},1000)'];
const brief={id:'crash-brief',revision:1,contractLevel:'strict',goal:'verify',scope:{include:['**'],exclude:[],repoId:fingerprint(repo).repoId},contextRefs:[],acceptance:[{id:'ac',description:'gate',required:true,gateIds:['test']}],verification:[{id:'test',kind:'command',command,timeoutSeconds:2,sideEffect:'none',category:'behavior'}],forbidden:[],standingOrders:[],reportFormat:'task-report-v1',timeboxSeconds:3};
await verify(repo,brief,{policy:{commands:[command]}});
