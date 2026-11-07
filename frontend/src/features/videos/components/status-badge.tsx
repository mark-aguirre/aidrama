import { Badge } from "@/components/ui/badge";
import type { ProcessingStatus, PublicationStatus } from "@/types/domain";

const publicationVariant: Record<
  PublicationStatus,
  { label: string; variant: "default" | "secondary" | "warning" | "destructive" | "success" | "outline" }
> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  PROCESSING: { label: "Processing", variant: "warning" },
  READY: { label: "Ready", variant: "outline" },
  PUBLISHED: { label: "Published", variant: "success" },
  UNPUBLISHED: { label: "Unpublished", variant: "secondary" },
  FAILED: { label: "Failed", variant: "destructive" },
  REMOVED: { label: "Removed", variant: "destructive" },
};

/** Publication status chip for the creator content list (spec 3.4). */
export function PublicationBadge({ status }: { status: PublicationStatus }) {
  const { label, variant } = publicationVariant[status];
  return <Badge variant={variant}>{label}</Badge>;
}

const processingVariant: Record<
  ProcessingStatus,
  { label: string; variant: "default" | "secondary" | "warning" | "destructive" | "success" }
> = {
  PENDING: { label: "Pending", variant: "secondary" },
  UPLOADING: { label: "Uploading", variant: "default" },
  PROCESSING: { label: "Processing", variant: "warning" },
  READY: { label: "Ready", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
};

/** Processing lifecycle chip (spec 3.7: PENDING -> UPLOADING -> PROCESSING -> READY). */
export function ProcessingBadge({ status }: { status: ProcessingStatus }) {
  const { label, variant } = processingVariant[status];
  return <Badge variant={variant}>{label}</Badge>;
}
