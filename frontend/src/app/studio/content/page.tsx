import Link from "next/link";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatorContentList } from "@/features/videos/components/creator-content-list";

export const metadata = { title: "My Content" };

export default function MyContentPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-foreground">My Content</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you have uploaded, drafted, or published.
          </p>
        </div>
        <Button asChild>
          <Link href="/studio/upload">
            <UploadCloud aria-hidden="true" />
            Upload content
          </Link>
        </Button>
      </div>
      <CreatorContentList />
    </div>
  );
}
