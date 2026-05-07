// One-shot: add the RV Park property to Convex.
//
// Hollister + Belgold flow through Yardi; the RV Park doesn't have a Yardi
// feed yet (and may never — it's not clear it's even in Yardi). Until that's
// resolved, we still need a properties row so the Sidebar dropdown shows it
// and pages can render an empty-state instead of breaking.
//
// Run:
//   node scripts/add-rv-park.mjs
//
// Idempotent: bails out cleanly if a property with code "rv-ohio" already exists.
import { ConvexHttpClient } from "convex/browser";

const URL = process.env.CONVEX_URL || "https://industrious-blackbird-448.convex.cloud";

const RV_PARK = {
  code: "rv-ohio",
  // Placeholder name + location — user can edit in the Convex dashboard once
  // the official property name lands. The earlier project memory referred to
  // it as "RV Park (RV Ohio)" / Brandenburg, KY.
  name: "Bradenburg RV Park",
  location: "Brandenburg, KY",
  propertyType: "rv_park",
  hasData: false,
};

async function main() {
  const client = new ConvexHttpClient(URL);
  const existing = await client.query("properties:list", {});
  const dupe = existing.find((p) => p.code === RV_PARK.code);
  if (dupe) {
    console.log(`Property with code "${RV_PARK.code}" already exists (${dupe.name}). Nothing to do.`);
    return;
  }
  console.log(`Creating property: ${RV_PARK.name} (${RV_PARK.code})…`);
  const id = await client.mutation("properties:create", RV_PARK);
  console.log(`Created. _id = ${id}`);
  const after = await client.query("properties:list", {});
  console.log("properties:list →");
  console.log(
    JSON.stringify(
      after.map((p) => ({ code: p.code, name: p.name, type: p.propertyType, hasData: p.hasData })),
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
