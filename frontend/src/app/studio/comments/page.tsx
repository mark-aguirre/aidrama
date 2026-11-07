import { Suspense } from "react";
import { MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Comments" };

async function CommentList() {
  const comments = await api.listCreatorComments();

  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-media border border-dashed border-border py-20 text-center">
        <MessageSquare className="text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          No comments yet. They will appear here as viewers respond.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {comments.map((c) => (
        <Card key={c.id} className="p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-display text-foreground">
              {c.authorName.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-foreground">
                  {c.authorName}
                </span>
                <span className="text-muted-foreground">on {c.videoTitle}</span>
                <span className="h-3 w-px bg-border" aria-hidden="true" />
                <span className="text-xs text-muted-foreground">
                  {formatDate(c.createdAt)}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{c.body}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" size="sm">
                  Reply
                </Button>
                <Button variant="ghost" size="sm">
                  Hide
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-2" />
      ))}
    </div>
  );
}

export default function CommentsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground">Comments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent comments across your videos.
        </p>
      </div>
      <Suspense fallback={<CommentSkeleton />}>
        <CommentList />
      </Suspense>
    </div>
  );
}
