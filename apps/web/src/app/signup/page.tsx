"use client";

import { SignupUi } from "./signup-ui";
import { useSignupPage } from "./use-signup-page";

export default function SignupPage() {
  return <SignupUi state={useSignupPage()} />;
}
