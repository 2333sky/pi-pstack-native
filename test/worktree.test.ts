import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createWorktree, isWorktreeDirty, removeWorktree } from "../src/worktree/manager.ts";

function git(cwd: string, ...args: string[]) { return execFileSync("git", args, {cwd,encoding:"utf8"}).trim(); }

test("worktree manager isolates writers and refuses dirty cleanup", async () => {
  const base = mkdtempSync(join(process.cwd(), ".pstack-git-"));
  const home = mkdtempSync(join(process.cwd(), ".pstack-home-"));
  const old = process.env.PSTACK_NATIVE_HOME; process.env.PSTACK_NATIVE_HOME = home;
  try {
    git(base,"init","-q"); git(base,"config","user.email","test@example.com"); git(base,"config","user.name","test");
    writeFileSync(join(base,"x.txt"),"one\n"); git(base,"add","x.txt"); git(base,"commit","-qm","init");
    const wt = await createWorktree(base,"owner-1");
    writeFileSync(join(wt.path,"x.txt"),"two\n");
    assert.equal(await isWorktreeDirty(wt.path), true);
    await assert.rejects(() => removeWorktree(wt), /Refusing to remove dirty worktree/);
    git(wt.path,"checkout","--","x.txt");
    await removeWorktree(wt);
  } finally {
    if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old;
    rmSync(base,{recursive:true,force:true}); rmSync(home,{recursive:true,force:true});
  }
});

test('worktree audit compares the explicit PR parent, not a hard-coded default branch',async()=>{
 const {auditWorktree}=await import('../src/worktree/manager.ts');
 const base=mkdtempSync(join(process.cwd(),'.audit-git-')),home=mkdtempSync(join(process.cwd(),'.audit-home-')),old=process.env.PSTACK_NATIVE_HOME;process.env.PSTACK_NATIVE_HOME=home;
 try{
  git(base,'init','-q','-b','main');git(base,'config','user.email','test@example.invalid');git(base,'config','user.name','Test');writeFileSync(join(base,'x'),'base');git(base,'add','.');git(base,'commit','-qm','base');
  const wt=await createWorktree(base,'audit-owner','main');writeFileSync(join(wt.path,'unit'),'unit');git(wt.path,'add','.');git(wt.path,'commit','-qm','unit');
  const notMerged=await auditWorktree(wt,'main');assert.equal(notMerged.merged,false);assert.equal(notMerged.ahead,1);assert.equal(notMerged.dirty,false);
  git(base,'branch','parent',git(wt.path,'rev-parse','HEAD'));const merged=await auditWorktree(wt,'parent');assert.equal(merged.merged,true);assert.equal(merged.ahead,0);assert.equal(merged.comparisonBase,'parent');
  await assert.rejects(auditWorktree(wt,'--all'));await removeWorktree(wt);
 }finally{if(old===undefined)delete process.env.PSTACK_NATIVE_HOME;else process.env.PSTACK_NATIVE_HOME=old;rmSync(base,{recursive:true,force:true});rmSync(home,{recursive:true,force:true});}
});
