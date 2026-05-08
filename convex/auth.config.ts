// Convex auth provider config — wires Clerk's frontend API to Convex's
// JWT validator so authenticated WebSocket sessions don't bounce with
// "No auth provider found matching the given token" on every reconnect.
//
// We accept BOTH Clerk environments so the same Convex deployment can
// validate tokens from prod (clerk.dealmanagerai.com) and dev / test
// (ready-tiger-31.clerk.accounts.dev). `applicationID` must match the
// JWT template name in Clerk → Templates.
export default {
  providers: [
    {
      domain: "https://clerk.dealmanagerai.com",
      applicationID: "sync",
    },
    {
      domain: "https://ready-tiger-31.clerk.accounts.dev",
      applicationID: "sync",
    },
  ],
};
