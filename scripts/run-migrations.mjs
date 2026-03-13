import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);

const migrations = [
  {
    name: "0014_category_profile",
    sql: await import("fs").then(fs => fs.readFileSync(new URL("../drizzle/0014_category_profile.sql", import.meta.url), "utf8")),
  },
  {
    name: "0015_bank_statement_import",
    sql: await import("fs").then(fs => fs.readFileSync(new URL("../drizzle/0015_bank_statement_import.sql", import.meta.url), "utf8")),
  },
  {
    name: "0016_employee_email",
    sql: `ALTER TABLE \`employees\` ADD COLUMN \`email\` varchar(300);`,
  },
  {
    name: "0017_statement_rules",
    sql: `
CREATE TABLE IF NOT EXISTS \`statement_rules\` (
  \`id\` int AUTO_INCREMENT PRIMARY KEY,
  \`userId\` int NOT NULL,
  \`groupId\` int,
  \`pattern\` varchar(300) NOT NULL,
  \`category\` varchar(100) NOT NULL,
  \`profile\` enum('Pessoal','Empresa') NOT NULL,
  \`suggestedDescription\` varchar(500),
  \`usageCount\` int NOT NULL DEFAULT 1,
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY \`uniq_user_pattern\` (\`userId\`, \`pattern\`)
);`,
  },
];

for (const m of migrations) {
  try {
    // Run each statement separately
    const statements = m.sql.split(";").map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith("--"));
    for (const stmt of statements) {
      await conn.execute(stmt);
    }
    console.log(`✓ ${m.name}`);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.code === "ER_TABLE_EXISTS_ERROR" || e.code === "ER_DUP_KEYNAME") {
      console.log(`~ ${m.name} (já existe, ignorado)`);
    } else {
      console.error(`✗ ${m.name}: ${e.message}`);
    }
  }
}

await conn.end();
console.log("Done.");
