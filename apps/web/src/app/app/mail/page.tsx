import { Suspense } from "react";
import { MailWorkspace } from "./mail-workspace";

export default function MailPage() {
  return (
    <Suspense fallback={null}>
      <MailWorkspace />
    </Suspense>
  );
}
