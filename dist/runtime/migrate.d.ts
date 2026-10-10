export declare function migrate(dryRun?: boolean): {
    dryRun: boolean;
    records: {
        id: string;
        path: string;
        needsMigration: boolean;
    }[];
    backup?: string;
};
