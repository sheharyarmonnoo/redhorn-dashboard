import { mutation } from "./_generated/server";

// One-shot cleanup: wipe sample/seed data before launch.
// Tenants and properties are preserved (real Hollister data).
export const wipeSampleData = mutation({
  handler: async (ctx) => {
    const counts = { deals: 0, monthly_revenue: 0, action_items: 0, activity_log: 0 };

    for (const row of await ctx.db.query("deals").collect()) {
      await ctx.db.delete(row._id);
      counts.deals++;
    }
    for (const row of await ctx.db.query("monthly_revenue").collect()) {
      await ctx.db.delete(row._id);
      counts.monthly_revenue++;
    }
    for (const row of await ctx.db.query("action_items").collect()) {
      await ctx.db.delete(row._id);
      counts.action_items++;
    }
    for (const row of await ctx.db.query("activity_log").collect()) {
      await ctx.db.delete(row._id);
      counts.activity_log++;
    }

    return counts;
  },
});
