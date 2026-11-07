import * as React from "react";
import Image from "next/image";
import { Logo } from "@/components/layout/logo";

/**
 * Split auth layout: key art with the brand promise beside the form.
 * `headingRef` lets a flow move focus to the heading when its state changes
 * (for example after sign-up), so screen readers announce the outcome.
 */
export function AuthShell({
  heading,
  subheading,
  headingRef,
  children,
}: {
  heading: string;
  subheading: React.ReactNode;
  headingRef?: React.Ref<HTMLHeadingElement>;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-1">
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-10 lg:flex">
        <Image
          src="https://picsum.photos/seed/auth-key-art/1200/1400"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/30" />
        <Logo className="relative" />
        <div className="relative">
          <p className="font-display text-4xl leading-tight text-foreground">
            Endless stories.
            <br />
            <span className="text-gradient">New worlds.</span>
          </p>
          <p className="mt-3 max-w-sm text-sm text-foreground/75">
            Watch, create, and share AI-generated dramas in any genre, any
            language, anytime.
          </p>
        </div>
      </aside>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-3xl text-foreground focus-visible:outline-none"
          >
            {heading}
          </h1>
          <p className="mb-8 mt-1.5 text-sm text-muted-foreground">
            {subheading}
          </p>
          {children}
        </div>
      </div>
    </main>
  );
}
