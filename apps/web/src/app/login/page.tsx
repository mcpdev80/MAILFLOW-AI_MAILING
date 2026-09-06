"use client";

import { LoginUi } from "./login-ui";
import { useLoginPage } from "./use-login-page";

export default function LoginPage() {
  return <LoginUi state={useLoginPage()} />;
}
