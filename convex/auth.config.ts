// Convex auth provider config — wires Clerk's frontend API to Convex's
// JWT validator so authenticated WebSocket sessions don't bounce with
// "No auth provider found matching the given token" on every reconnect.
//
// `domain` must match the Clerk frontend API URL for the same instance
// referenced by NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY. The `applicationID`
// is the JWT template name configured in the Clerk dashboard
// (Templates → New template → "convex"). The default Clerk template
// already named "convex" works out of the box.
export default {
  providers: [
    {
      domain: "https://ready-tiger-31.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
