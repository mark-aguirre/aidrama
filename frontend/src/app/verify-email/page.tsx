import { Suspense } from "react";
import { VerifyEmailFlow } from "@/features/auth/components/verify-email-flow";

export const metadata = { title: "Verify your email" };

async function VerifyEmailContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <VerifyEmailFlow token={typeof token === "string" ? token : null} />;
}

/** Target of the emailed verification link: `/verify-email?token=<token>` (API-CONTRACT.md). */
export default function VerifyEmailPage({
  searchParams,
}: PageProps<"/verify-email">) {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent searchParams={searchParams} />
    </Suspense>
  );
}
