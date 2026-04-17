import { SignIn } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

export default function SignInPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 bg-[#09090b]">
      <div className="mb-8 sm:mb-10">
        <img
          src="/redhorn-logo.png"
          alt="Redhorn Capital Partners"
          className="h-10 w-auto brightness-0 invert opacity-90"
        />
      </div>
      <div className="w-full max-w-[400px]">
        <SignIn
          appearance={{
            baseTheme: dark,
            variables: {
              colorBackground: "#18181b",
              colorInputBackground: "rgba(255,255,255,0.04)",
              colorPrimary: "#fafafa",
              colorText: "#fafafa",
              colorTextSecondary: "#a1a1aa",
              colorInputText: "#fafafa",
              colorNeutral: "#fafafa",
              borderRadius: "6px",
            },
            elements: {
              card: "shadow-none border border-white/10",
              headerTitle: "!text-white",
              headerSubtitle: "!text-white/60",
              formFieldLabel: "!text-white/70",
              formFieldInput: "!text-white !bg-white/5 !border-white/10",
              formButtonPrimary: "!bg-white !text-[#18181b] hover:!bg-white/90",
              footerActionLink: "!text-white/80 hover:!text-white",
              footer: "hidden",
            },
          }}
        />
      </div>
      <p className="mt-6 text-[10px] text-white/20 text-center">
        Powered by Deal Manager AI
      </p>
    </div>
  );
}
