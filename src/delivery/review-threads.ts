export interface ReviewThread {id:string;resolved:boolean;author:string|null;createdAt:string|null}
export interface ReviewThreadSummary {status:'checked';unresolved:number;bugbotUnresolved:number;total:number}
export const REVIEW_THREADS_QUERY = `query($owner:String!,$repo:String!,$number:Int!,$after:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{id isResolved comments(first:1){nodes{createdAt author{login}}}}}}}}`;
export function parseReviewThreadPage(value:any):{threads:ReviewThread[];next:string|null} {
 const page=value?.data?.repository?.pullRequest?.reviewThreads;
 if(value?.errors?.length || !page || !Array.isArray(page.nodes) || page.nodes.length>100 || typeof page.pageInfo?.hasNextPage!=='boolean')throw new Error('REVIEW_THREADS_UNAVAILABLE');
 const threads=page.nodes.map((node:any)=>{
  if(typeof node.id!=='string' || !node.id || typeof node.isResolved!=='boolean' || !Array.isArray(node.comments?.nodes))throw new Error('REVIEW_THREADS_UNAVAILABLE');
  const first=node.comments.nodes[0];return {id:node.id,resolved:node.isResolved,author:first?.author?.login ?? null,createdAt:first?.createdAt ?? null};
 });
 const next=page.pageInfo.hasNextPage?page.pageInfo.endCursor:null;
 if(page.pageInfo.hasNextPage && (typeof next!=='string' || !next || next.length>2048))throw new Error('REVIEW_THREADS_CURSOR_INVALID');
 return {threads,next};
}
export async function collectReviewThreads(read:(cursor:string|null)=>Promise<unknown>):Promise<ReviewThreadSummary> {
 const cursors=new Set<string>(),threads=new Map<string,ReviewThread>();let cursor:string|null=null,pages=0;
 do {
  if(++pages>50)throw new Error('REVIEW_THREADS_PAGE_LIMIT');
  const page=parseReviewThreadPage(await read(cursor));
  for(const t of page.threads) {
   const previous=threads.get(t.id);if(previous && JSON.stringify(previous)!==JSON.stringify(t))throw new Error('REVIEW_THREADS_CHANGED_DURING_SCAN');threads.set(t.id,t);
  }
  cursor=page.next;
  if(cursor) {if(cursors.has(cursor))throw new Error('REVIEW_THREADS_CURSOR_REPEATED');cursors.add(cursor);}
 }while(cursor!==null);
 const unresolved=[...threads.values()].filter(t=>!t.resolved);
 return {status:'checked',total:threads.size,unresolved:unresolved.length,bugbotUnresolved:unresolved.filter(t=>/bugbot/i.test(t.author ?? '')).length};
}
