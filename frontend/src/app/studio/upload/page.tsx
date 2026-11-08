import { UploadWizard } from "@/features/upload/components/upload-wizard";

export const metadata = { title: "Upload" };

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 max-w-2xl">
        <h1 className="font-display text-3xl text-foreground">Upload content</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Add your video and thumbnail. We prepare it for streaming before you
          publish.
        </p>
      </div>
      <UploadWizard />
    </div>
  );
}
