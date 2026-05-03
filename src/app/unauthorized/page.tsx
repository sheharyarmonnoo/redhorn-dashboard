"use client";

import { useClerk } from "@clerk/nextjs";

export default function UnauthorizedPage() {
  const { signOut } = useClerk();

  return (
    <div className="flex-1 flex items-center justify-center min-h-screen bg-[#09090b]">
      <div className="text-center max-w-md px-6">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold mb-2 text-white">Access Restricted</h1>
        <p className="text-sm mb-6 text-white/60">
          This dashboard is only available to <strong>Redhorn Capital Partners</strong> team members.
          Please sign in with your authorized account.
        </p>
        <button
          onClick={() => signOut({ redirectUrl: "/sign-in" })}
          className="px-6 py-2.5 text-sm bg-white text-[#18181b] rounded-md font-medium hover:bg-white/90 cursor-pointer"
        >
          Sign Out & Try Again
        </button>
      </div>
    </div>
  );
}
