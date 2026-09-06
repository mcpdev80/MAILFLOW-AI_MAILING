"use client";

import { useState } from "react";
import { WizardShell, wizardStyles as s } from "@/components/wizard-shell";
import { InstanceSetup } from "./setup-ui";

export function SetupFlow() {
  const [started, setStarted] = useState(false);

  if (started) return <InstanceSetup />;

  return (
    <WizardShell
      kind="setup"
      step={1}
      total={4}
      title="Welcome to Mailflow"
      subtitle="We will prepare your instance in four short steps, then continue with the separate 6-step user onboarding."
      next={{ label: "Start setup", onClick: () => setStarted(true) }}
    >
      <div className={s.section}>
        <div>
          <strong>1. Language & appearance</strong>
          <p>Choose the initial language and theme defaults for this instance.</p>
        </div>
        <div>
          <strong>2. URL & HTTPS</strong>
          <p>Review the public address and TLS configuration detected from the installation.</p>
        </div>
        <div>
          <strong>3. AI provider</strong>
          <p>Connect the model endpoint Mailflow will use for classification and generation.</p>
        </div>
        <div>
          <strong>4. Instance verification</strong>
          <p>Verify frontend, API, authentication, database, HTTPS and AI connectivity.</p>
        </div>
      </div>
      <div className={s.info}>
        <span className={s.infoIcon}>i</span>
        <span>
          After instance setup, Mailflow starts the separate 6-step onboarding for mailbox, privacy and behavior settings.
        </span>
      </div>
    </WizardShell>
  );
}
