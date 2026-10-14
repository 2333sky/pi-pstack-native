// Runs only in a separate trusted Actions job with issues:write. No upstream code executes.
module.exports = async function notify({ github, owner, repo, report }) {
  if(report.schemaVersion !== 1 || !/^[a-f0-9]{12}_[a-f0-9]{12}$/.test(report.syncId) || !/^[a-f0-9]{40}$/.test(report.candidate?.sha) || !/^[a-f0-9]{40}$/.test(report.baseline?.sha) || !['changes_detected','blocked','no_change'].includes(report.status)) throw new Error('Invalid notification report');
  if(report.status === 'no_change') return {status:'no_change'};
  const marker = `<!-- pstack-upstream-sync:${report.syncId} -->`;
  const title = `Upstream pstack sync ${report.syncId}`;
  // Do not render arbitrary upstream text, paths or prompts under a privileged token.
  const body = `${marker}\nPinned baseline: ${report.baseline.sha}\nPinned candidate: ${report.candidate.sha}\nStatus: ${report.status}\nChanged files: ${report.changes.length}\n\nDownload the read-only scan artifact from Actions for evidence and pending migration tasks. Detection is not porting, review or integration. All verification gates: not_run. Maintainer semantic review required. No baseline advancement, automatic merge or publish.`;
  const issues = await github.paginate(github.rest.issues.listForRepo,{owner,repo,state:'all',per_page:100});
  const existing = issues.find(i=>!i.pull_request && i.body?.includes(marker));
  if(existing) {
    if(existing.body !== body) await github.rest.issues.update({owner,repo,issue_number:existing.number,body});
    return {status:'updated',number:existing.number};
  }
  const result = await github.rest.issues.create({owner,repo,title,body});
  return {status:'created',number:result.data.number};
};
