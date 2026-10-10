import { FileLock } from "./lock.js";
import { lockPath } from "./home.js";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { homePath } from "./home.js";
import { writeJsonAtomic } from "./store.js";
export function migrate(dryRun = true) {
    const records = [];
    for (const kind of ['workflows', 'agents']) {
        const dir = homePath(kind);
        if (!existsSync(dir))
            continue;
        for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
            const path = homePath(kind, file);
            const r = JSON.parse(readFileSync(path, 'utf8'));
            if (!r.id)
                throw new Error(`STATE_UNCERTAIN: ${file}`);
            records.push({ id: r.id, path, needsMigration: r.schemaVersion !== 2 });
        }
    }
    if (dryRun)
        return { dryRun, records };
    const backup = homePath('backups', String(Date.now()));
    mkdirSync(backup, { recursive: true });
    for (const r of records.filter(r => r.needsMigration)) {
        const kind = r.path.includes('/workflows/') ? 'workflow' : 'agent';
        const lock = new FileLock(lockPath(`state-${kind}-${r.id}`));
        if (!lock.acquire())
            throw new Error('MIGRATION_BUSY');
        try {
            const value = JSON.parse(readFileSync(r.path, 'utf8'));
            if (['running', 'cancelling'].includes(value.state))
                throw new Error('MIGRATION_REQUIRES_QUIESCENT_STORE');
            copyFileSync(r.path, `${backup}/${r.id}.json`);
            value.schemaVersion = 2;
            if (value.calls)
                value.verification = 'unknown';
            writeJsonAtomic(r.path, value);
        }
        finally {
            lock.release();
        }
    }
    return { dryRun, records, backup };
}
