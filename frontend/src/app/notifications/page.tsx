import { Suspense } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Heart,
  MessageSquare,
  Reply,
  ShieldAlert,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { formatDate } from "@/lib/utils";
import type { NotificationType } from "@/types/domain";
import { cn } from "@/lib/utils";

const icon: Record<NotificationType, LucideIcon> = {
  NEW_FOLLOWER: UserPlus,
  NEW_COMMENT: MessageSquare,
  COMMENT_REPLY: Reply,
  CONTENT_LIKED: Heart,
  CREATOR_PUBLISHED: Sparkles,
  PROCESSING_COMPLETE: CheckCircle2,
  PROCESSING_FAILED: AlertTriangle,
  MODERATION_NOTICE: ShieldAlert,
};

async function NotificationList() {
  const items = await api.listNotifications();

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You are all caught up. Nothing new here.
      </p>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border/70">
        {items.map((n) => {
          const Icon = icon[n.type];
          return (
            <li
              key={n.id}
              className={cn(
                "flex items-start gap-3 px-5 py-4",
                !n.read && "bg-primary/[0.04]",
              )}
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{n.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(n.createdAt)}
                </p>
              </div>
              {!n.read && (
                <span
                  className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                  aria-label="Unread"
                />
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function NotificationSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />
      ))}
    </div>
  );
}

export const metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <PageShell>
      <PageTitle title="Notifications" />
      <div className="max-w-2xl">
        <Suspense fallback={<NotificationSkeleton />}>
          <NotificationList />
        </Suspense>
      </div>
    </PageShell>
  );
}
