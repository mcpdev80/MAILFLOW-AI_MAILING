import { AdminShell } from "@/components/admin-shell";

export default function OrganizationAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell plane="organization">{children}</AdminShell>;
}
