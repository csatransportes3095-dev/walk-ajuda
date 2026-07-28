// MUST be the very first file loaded — sets TZ before any module initializes
// This ensures Drizzle ORM interprets MySQL timestamps as UTC regardless of Cloud Run locale
process.env.TZ = "UTC";

// Now import the actual server
import "./_core/index.ts";
