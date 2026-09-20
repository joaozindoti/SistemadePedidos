"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browserClient";
import { Icon } from "@/lib/ui";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setSubmitting(false);

    if (signInError) {
      setError("E-mail ou senha incorretos.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-margin">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-container-lowest">
        <Icon name="local_pizza" className="text-primary text-[28px]" />
      </div>
      <h1 className="mt-space-md font-headline-lg text-headline-lg uppercase tracking-wide text-primary">
        Painel Admin
      </h1>
      <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
        Sidney &amp; Shirley Pizzaria
      </p>

      <form onSubmit={handleSubmit} className="mt-space-xl flex w-full max-w-xs flex-col gap-space-md">
        <label className="flex flex-col gap-space-xs">
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            E-mail
          </span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-surface-container-highest bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none transition-colors focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-space-xs">
          <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
            Senha
          </span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-surface-container-highest bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none transition-colors focus:border-primary"
          />
        </label>

        {error && (
          <p className="font-body-sm text-body-sm text-error">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-space-xs w-full rounded-full bg-primary py-space-sm text-center font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
