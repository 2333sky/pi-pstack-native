export interface ReviewThread {
    id: string;
    resolved: boolean;
    author: string | null;
    createdAt: string | null;
}
export interface ReviewThreadSummary {
    status: 'checked';
    unresolved: number;
    bugbotUnresolved: number;
    total: number;
}
export declare const REVIEW_THREADS_QUERY = "query($owner:String!,$repo:String!,$number:Int!,$after:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{id isResolved comments(first:1){nodes{createdAt author{login}}}}}}}}";
export declare function parseReviewThreadPage(value: any): {
    threads: ReviewThread[];
    next: string | null;
};
export declare function collectReviewThreads(read: (cursor: string | null) => Promise<unknown>): Promise<ReviewThreadSummary>;
