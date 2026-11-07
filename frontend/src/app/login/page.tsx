import { Suspense } from "react";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell heading="Welcome back" subheading="Log in to your account.">
      {/* LoginForm reads useSearchParams (?next=), which needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
