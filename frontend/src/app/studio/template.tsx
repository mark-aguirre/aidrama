/**
 * Unlike a layout, a template remounts on every navigation inside Studio, so
 * each Studio page change replays the phone screen-enter animation. The
 * layout (sidebar, mobile header, tab bar) stays mounted and doesn't animate.
 */
export default function StudioTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="animate-screen">{children}</div>;
}
