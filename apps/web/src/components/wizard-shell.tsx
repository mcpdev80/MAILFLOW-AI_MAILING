"use client";

import type { ReactNode } from "react";
import styles from "./wizard-shell.module.css";

export function WizardShell({
  kind,
  step,
  total,
  title,
  subtitle,
  children,
  back,
  next,
}: {
  kind: "setup" | "onboarding";
  step: number;
  total: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  back?: { label?: string; onClick: () => void; disabled?: boolean };
  next: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <main className={styles.screen}>
      <section className={styles.window}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.logo}>➤</span>
            <span className={styles.brandName}>Mailflow</span>
            <span className={styles.badge}>{kind}</span>
          </div>
          <StepIndicator current={step} total={total} />
        </header>
        <div className={styles.content}>
          <div className={styles.heading}>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
        <footer className={styles.footer}>
          {back ? (
            <button className={styles.secondary} type="button" onClick={back.onClick} disabled={back.disabled}>← {back.label ?? "Back"}</button>
          ) : <span />}
          <button className={styles.primary} type="button" onClick={next.onClick} disabled={next.disabled}>{next.label} →</button>
        </footer>
      </section>
    </main>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className={styles.progress} aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, index) => index + 1).map((value) => (
        <div className={styles.stepGroup} key={value}>
          {value > 1 && <span className={`${styles.connector} ${value <= current ? styles.connectorDone : ""}`} />}
          <span className={`${styles.step} ${value === current ? styles.stepActive : ""} ${value < current ? styles.stepDone : ""}`}>
            {value < current ? "✓" : value}
          </span>
        </div>
      ))}
    </div>
  );
}

export { styles as wizardStyles };
