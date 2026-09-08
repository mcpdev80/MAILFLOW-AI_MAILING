import { AdminShell } from "@/components/admin-shell";

export default function InstanceAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell plane="instance">{children}</AdminShell>;
}
