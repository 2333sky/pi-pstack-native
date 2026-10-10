// A small supervisor keeps command lifetime tied to the runner's pipe and timeout.
import { spawn } from 'node:child_process';
const [timeoutText, executable, ...args]=process.argv.slice(2);
const child=spawn(executable,args,{shell:false,stdio:['ignore','inherit','inherit'],env:process.env});
const terminate=()=>{try{if(process.platform!=='win32')process.kill(-process.pid,'SIGKILL');else child.kill('SIGKILL');}catch{};process.exit(124);};
const timer=setTimeout(terminate,Number(timeoutText));
process.stdin.resume();process.stdin.on('end',terminate);
child.on('error',error=>{clearTimeout(timer);process.stderr.write(error.message);process.exit(127);});
child.on('exit',(code,signal)=>{clearTimeout(timer);process.exit(code ?? (signal?125:0));});
