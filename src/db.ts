import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

export interface ExperimentRecord {
    id: string;
    name: string;
    path: string;
    status: 'CREATED' | 'FINALIZED';
    created_at: string;
    finalized_at?: string;
    manifest_path?: string;
}

export class DatabaseManager {
    private db: sqlite3.Database | null = null;
    private dbPath: string;

    constructor() {
        // Store DB in ~/.immutable-sandbox/registry.db
        const homeDir = os.homedir();
        const appDir = path.join(homeDir, '.immutable-sandbox');
        fs.ensureDirSync(appDir);
        this.dbPath = path.join(appDir, 'registry.db');
    }

    public init(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) return reject(err);

                // Create table if not exists
                const sql = `
                    CREATE TABLE IF NOT EXISTS experiments (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        path TEXT NOT NULL,
                        status TEXT CHECK(status IN ('CREATED', 'FINALIZED')) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        finalized_at DATETIME,
                        manifest_path TEXT
                    )
                `;

                if (!this.db) {
                    return reject(new Error("DB instance lost during initialization"));
                }
                this.db.run(sql, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }

    public insertExperiment(id: string, name: string, path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const sql = `INSERT INTO experiments (id, name, path, status) VALUES (?, ?, ?, 'CREATED')`;
            this.db.run(sql, [id, name, path], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    public finalizeExperiment(path: string, manifestPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const sql = `
                UPDATE experiments 
                SET status = 'FINALIZED', finalized_at = CURRENT_TIMESTAMP, manifest_path = ? 
                WHERE path = ?
            `;
            this.db.run(sql, [manifestPath, path], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    public getAllExperiments(): Promise<ExperimentRecord[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const sql = `SELECT * FROM experiments ORDER BY created_at DESC`;
            this.db.all(sql, (err, rows) => {
                if (err) reject(err);
                else resolve(rows as ExperimentRecord[]);
            });
        });
    }

    public close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
