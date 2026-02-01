import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

export interface ExperimentRecord {
    id: string;
    name: string;
    path: string;
    status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED';
    created_at: string;
    last_opened_at?: string;
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

                if (this.db) {
                    this.db.run('PRAGMA journal_mode = WAL;'); // Improves concurrency
                }

                // Create table if not exists (preserves existing data)
                const createSql = `
                    CREATE TABLE IF NOT EXISTS experiments (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        path TEXT NOT NULL,
                        status TEXT CHECK(status IN ('CREATED', 'IN_PROGRESS', 'COMPLETED')) NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_opened_at DATETIME,
                        finalized_at DATETIME,
                        manifest_path TEXT
                    )
                `;

                if (!this.db) {
                    return reject(new Error("DB instance lost"));
                }

                this.db.run(createSql, (err) => {
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

    public updateExperimentStatus(path: string, status: 'IN_PROGRESS' | 'COMPLETED'): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            let sql = `UPDATE experiments SET status = ? WHERE path = ?`;

            // If finalizing, also set finalized_at
            if (status === 'COMPLETED') {
                sql = `UPDATE experiments SET status = ?, finalized_at = CURRENT_TIMESTAMP WHERE path = ?`;
            }

            this.db.run(sql, [status, path], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    public updateLastOpened(path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            // Use explicit ISO string for UTC consistency if needed, but CURRENT_TIMESTAMP is usually UTC in sqlite
            const now = new Date().toISOString();
            const sql = `UPDATE experiments SET last_opened_at = ? WHERE path = ?`;
            this.db.run(sql, [now, path], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    public finalizeExperiment(path: string, manifestPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Wrapper to ensure finalize sets COMPLETED and path
            // In this new model, we might just call updateExperimentStatus('COMPLETED') 
            // but let's keep specific method for updating manifest_path
            if (!this.db) return reject(new Error('DB not initialized'));
            const sql = `
                UPDATE experiments 
                SET status = 'COMPLETED', finalized_at = CURRENT_TIMESTAMP, manifest_path = ? 
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

    public getExperimentByPath(path: string): Promise<ExperimentRecord | undefined> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const sql = `SELECT * FROM experiments WHERE path = ?`;
            this.db.get(sql, [path], (err, row) => {
                if (err) reject(err);
                else resolve(row as ExperimentRecord);
            });
        });
    }

    public deleteExperiment(path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const sql = `DELETE FROM experiments WHERE path = ?`;
            this.db.run(sql, [path], (err) => {
                if (err) reject(err);
                else resolve();
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
