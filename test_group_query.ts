import "./scripts/load-env.js";
import { getDb } from "./server/db";
import { groupMembers } from "./drizzle/schema";
import { eq } from "drizzle-orm";

(async () => {
  const db = await getDb();
  if (!db) { console.error("DB not available"); process.exit(1); }
  
  try {
    const result = await db.select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, 1))
      .limit(1);
    console.log("Query OK:", JSON.stringify(result));
  } catch(e: any) {
    console.error("Query FAILED:", e.message);
  }
  process.exit(0);
})();
