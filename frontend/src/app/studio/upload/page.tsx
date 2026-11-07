import { UploadWizard } from "@/features/upload/components/upload-wizard";

export const metadata = { title: "Upload" };

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-foreground">Upload content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload an AI-generated video. It is transcoded to a streaming format
          before you can publish it.
        </p>
      </div>
      <UploadWizard />
    </div>
  );
}
