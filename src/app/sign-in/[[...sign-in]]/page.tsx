import { SignIn } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

export default function SignInPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen px-4 bg-[#09090b]">
      <div className="mb-8 sm:mb-10">
        <img
          src="/redhorn-logo.png"
          alt="Redhorn Capital Partners"
          className="h-10 w-auto brightness-0 invert opacity-90"
        />
      </div>
      <div className="w-full max-w-[400px] mx-auto auth-clerk-wrapper">
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
              rootBox: "w-full mx-auto",
              cardBox: "w-full mx-auto",
              card: "shadow-none border border-white/10 mx-auto",
              headerTitle: "!text-white",
              headerSubtitle: "!text-white/60",
              socialButtonsBlockButton: "!text-white !border-white/10 hover:!bg-white/[0.04]",
              socialButtonsBlockButtonText: "!text-white",
              dividerLine: "!bg-white/10",
              dividerText: "!text-white/40",
              formFieldLabel: "!text-white/70",
              formFieldInput: "!text-white !bg-white/5 !border-white/10",
              // OTP code boxes use a separate element class — without this
              // override the digits render as black on dark background.
              otpCodeFieldInput: "!text-white !bg-white/5 !border-white/10",
              formResendCodeLink: "!text-white/70 hover:!text-white",
              formButtonPrimary: "!bg-white !text-[#18181b] hover:!bg-white/90",
              identityPreviewText: "!text-white",
              identityPreviewEditButtonIcon: "!text-white/70",
              alternativeMethodsBlockButton: "!text-white !border-white/10 hover:!bg-white/[0.04]",
              footer: "!hidden",
              footerAction: "!hidden",
              footerActionLink: "!hidden",
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
