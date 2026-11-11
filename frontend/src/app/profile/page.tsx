import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { ProfileView } from "@/features/account/components/profile-view";

export const metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <PageShell>
      <PageTitle title="Profile" />
      <ProfileView />
    </PageShell>
  );
}
