import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";

export interface Command {
    id: number
    title: string
    body: string
    description: string
    tags: string
    language: string
    created_at: string
    updated_at: string
}
// Initialize and export the database connection
let db: Database.Database | null = null;
export function initializeDatabase() {
    console.log('Initializing database...')
    // get the path where electron stores user data
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'snipforge.db')
    console.log('Database path:', dbPath)
try {
    //create or open the database
    db = new Database(dbPath)
    // Create the commands table if it doesn't exist
    db.exec(`
        CREATE TABLE IF NOT EXISTS commands (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            description TEXT DEFAULT '',
            shell TEXT DEFAULT '',
            tags TEXT DEFAULT '[]',
            variables TEXT DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    `)

    // Add description column to existing tables (migration)
    try {
        db.exec(`ALTER TABLE commands ADD COLUMN description TEXT DEFAULT ''`)
        console.log('Added description column to existing database')
    } catch (error) {
        // Column already exists or other error, ignore
        console.log('Description column already exists or table is new')
    }

    // Add language column to existing tables (migration)
    try {
        db.exec(`ALTER TABLE commands ADD COLUMN language TEXT DEFAULT 'plaintext'`)
        console.log('Added language column to existing database')
    } catch (error) {
        // Column already exists or other error, ignore
        console.log('Language column already exists or table is new')
    }

    console.log('Database table created successfully')
    return db
    }catch (error) {
        console.error('Error initializing database:', error)
        throw error
    }
}
// Function to get all commands from DB
export function getAllCommands(): Command[] {
    if (!db) throw new Error("Database not initialized");
    const stmt = db.prepare("SELECT * FROM commands ORDER BY updated_at DESC");
    return stmt.all() as Command[];
}
//update a command in DB
export function updateCommand(id: number, updates: Partial<Command>): boolean{
    if (!db) throw new Error("Database not initialized");

    const now = new Date().toISOString();
    const stmt = db.prepare(`
        UPDATE commands
        SET title = ?, body = ?, description = ?, tags = ?, language = ?, updated_at = ?
        WHERE id = ?
    `);
    const result = stmt.run(
        updates.title || '',
        updates.body || '',
        updates.description || '',
        updates.tags || '[]',
        updates.language || 'plaintext',
        now,
        id
    );
    return result.changes > 0;
}
// delete command from DB
export function deleteCommand(id: number): boolean {
    if (!db) throw new Error("Database not initialized");
    const stmt = db.prepare("DELETE FROM commands WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
}
// add a new command to DB
export function addCommand(command: Omit<Command, 'id' | 'created_at' | 'updated_at'>): number {
    if (!db) throw new Error("Database not initialized");
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        INSERT INTO commands (title, body, description, tags, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        command.title,
        command.body,
        command.description || '',
        command.tags || '[]',
        command.language || 'plaintext',
        now,
        now
    );
    return result.lastInsertRowid as number;
}
// test data function
export function seedTestData(): void {
    if (!db) throw new Error("Database not initialized");
    // check if we already have data
    const existingCommands = getAllCommands()
    if (existingCommands.length > 0) {
        console.log('Database already has data, skipping seeding.')
        return
    }

    console.log('Seeding database with test data...')

    //prepare the insert statement
    const insertCommand = db.prepare(`
        INSERT INTO commands (title, body, description, tags, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const now = new Date().toISOString()

    //sample welcome command
    insertCommand.run(
        'Welcome to SnipForge!',
        'You can create snippets in plain text or markdown, and add variables with the following syntax {{variable name}}. Read the help section for more.',
        'This section is used to describe your snippets and it also supports markdown, cool right?',
        '["snipforge", "by_artluxdm"]',
        'markdown',
        now,
        now
    )

    console.log('✅ Test data added successfully')
}