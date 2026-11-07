import { StudioSidebar } from "@/components/layout/studio-sidebar";
import {
  MOBILE_BAR_PADDING,
  MobileShellHeader,
  MobileShellTabBar,
} from "@/components/layout/page-shell";

export const metadata = {
  title: {
    default: "Creator Studio",
    template: "%s · Creator Studio · AI Drama",
  },
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Below `lg` the global mobile header and tab bar frame the Studio so
    // creators can navigate away; at `lg` and above only the sidebar shows.
    <div className={`flex flex-1 flex-col ${MOBILE_BAR_PADDING}`}>
      <MobileShellHeader />
      <div className="flex flex-1">
        <StudioSidebar />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
      <MobileShellTabBar />
    </div>
  );
}
