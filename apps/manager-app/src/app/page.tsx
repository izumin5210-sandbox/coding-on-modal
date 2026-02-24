"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthUser, MeResponse } from "@/lib/auth-types";
import type { SessionExecResult, SessionRecord } from "@/lib/session-types";

type ApiError = {
  error?: {
    message?: string;
  };
};

type SessionListResponse = {
  sessions: SessionRecord[];
};

type SessionResponse = {
  session: SessionRecord;
};

type CreateSessionPayload = {
  name?: string;
  repoUrl?: string;
  repoRef?: string;
};

type ExecResponse = {
  result: SessionExecResult;
};

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiError | null;
  return body?.error?.message ?? `Request failed (${response.status})`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export default function Home() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [claudeApiKeyConfigured, setClaudeApiKeyConfigured] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    name: "",
    repoUrl: "",
    repoRef: "",
  });

  const [command, setCommand] = useState("pwd && ls -la");
  const [agentPrompt, setAgentPrompt] = useState(
    "Summarize this repository and suggest one high-impact improvement.",
  );
  const [agentMaxTurns, setAgentMaxTurns] = useState("8");
  const [cwd, setCwd] = useState("/workspace/repo");
  const [execResult, setExecResult] = useState<SessionExecResult | null>(null);

  const [isClaudeApiKeyModalOpen, setIsClaudeApiKeyModalOpen] = useState(false);
  const [claudeApiKeyInput, setClaudeApiKeyInput] = useState("");
  const [claudeApiKeySaving, setClaudeApiKeySaving] = useState(false);
  const [claudeApiKeyError, setClaudeApiKeyError] = useState<string | null>(
    null,
  );
  const [pendingCreatePayload, setPendingCreatePayload] =
    useState<CreateSessionPayload | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? null,
    [sessions, selectedId],
  );

  const onUnauthorized = useCallback(() => {
    setUser(null);
    setClaudeApiKeyConfigured(false);
    setSessions([]);
    setSelectedId(null);
    setExecResult(null);
    setPendingCreatePayload(null);
    setIsClaudeApiKeyModalOpen(false);
    setClaudeApiKeyInput("");
    setClaudeApiKeyError(null);
    setMessage(null);
    setError("Authentication required. Please sign in with GitHub.");
  }, []);

  const ensureResponseOk = useCallback(
    async (response: Response) => {
      if (response.status === 401) {
        onUnauthorized();
        throw new Error("Authentication required");
      }
      if (!response.ok) {
        throw new Error(await parseError(response));
      }
    },
    [onUnauthorized],
  );

  const loadMe = useCallback(async () => {
    setAuthLoading(true);
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (response.status === 401) {
        setUser(null);
        setClaudeApiKeyConfigured(false);
        return;
      }
      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const body = (await response.json()) as MeResponse;
      setUser(body.user);
      setClaudeApiKeyConfigured(body.claudeApiKeyConfigured);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
      setUser(null);
      setClaudeApiKeyConfigured(false);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const loadSessions = useCallback(
    async (preferredId?: string) => {
      if (!user) {
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/sessions", { cache: "no-store" });
        await ensureResponseOk(response);

        const body = (await response.json()) as SessionListResponse;
        setSessions(body.sessions);

        setSelectedId((currentSelectedId) => {
          if (preferredId) {
            return preferredId;
          }

          if (
            currentSelectedId &&
            body.sessions.some((session) => session.id === currentSelectedId)
          ) {
            return currentSelectedId;
          }

          return body.sessions[0]?.id ?? null;
        });
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      } finally {
        setLoading(false);
      }
    },
    [ensureResponseOk, user],
  );

  const loadSessionDetail = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/sessions/${id}`, {
        cache: "no-store",
      });
      await ensureResponseOk(response);

      const body = (await response.json()) as SessionResponse;
      setSessions((current) =>
        current.map((session) =>
          session.id === body.session.id ? body.session : session,
        ),
      );
    },
    [ensureResponseOk],
  );

  const refreshSelected = useCallback(async () => {
    if (!selectedId) {
      return;
    }

    setBusy("refresh");
    setError(null);

    try {
      await loadSessionDetail(selectedId);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError),
      );
    } finally {
      setBusy(null);
    }
  }, [loadSessionDetail, selectedId]);

  async function submitCreateSession(payload: CreateSessionPayload) {
    setBusy("create");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      await ensureResponseOk(response);

      const body = (await response.json()) as SessionResponse;
      setCreateForm({ name: "", repoUrl: "", repoRef: "" });
      setExecResult(null);
      setMessage(`Session created: ${body.session.name}`);
      await loadSessions(body.session.id);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : String(createError),
      );
    } finally {
      setBusy(null);
    }
  }

  async function createSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: CreateSessionPayload = {
      name: createForm.name.trim() || undefined,
      repoUrl: createForm.repoUrl.trim() || undefined,
      repoRef: createForm.repoRef.trim() || undefined,
    };

    if (!claudeApiKeyConfigured) {
      setPendingCreatePayload(payload);
      setClaudeApiKeyError(null);
      setIsClaudeApiKeyModalOpen(true);
      return;
    }

    await submitCreateSession(payload);
  }

  async function saveClaudeApiKey() {
    const apiKey = claudeApiKeyInput.trim();
    if (!apiKey) {
      setClaudeApiKeyError("Claude API key is required.");
      return;
    }

    setClaudeApiKeySaving(true);
    setClaudeApiKeyError(null);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/claude-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      await ensureResponseOk(response);

      setClaudeApiKeyConfigured(true);
      setClaudeApiKeyInput("");
      setIsClaudeApiKeyModalOpen(false);
      setMessage("Claude API key saved.");

      if (pendingCreatePayload) {
        const payload = pendingCreatePayload;
        setPendingCreatePayload(null);
        await submitCreateSession(payload);
      }
    } catch (saveError) {
      setClaudeApiKeyError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    } finally {
      setClaudeApiKeySaving(false);
    }
  }

  async function terminateSession() {
    if (!selectedId) {
      return;
    }

    setBusy("terminate");
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${selectedId}/terminate`, {
        method: "POST",
      });
      await ensureResponseOk(response);

      const body = (await response.json()) as SessionResponse;
      setSessions((current) =>
        current.map((session) =>
          session.id === body.session.id ? body.session : session,
        ),
      );
      setMessage(`Session terminated: ${body.session.name}`);
    } catch (terminateError) {
      setError(
        terminateError instanceof Error
          ? terminateError.message
          : String(terminateError),
      );
    } finally {
      setBusy(null);
    }
  }

  async function deleteSession() {
    if (!selectedId) {
      return;
    }

    const idToDelete = selectedId;
    setBusy("delete");
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${idToDelete}`, {
        method: "DELETE",
      });
      await ensureResponseOk(response);

      setExecResult(null);
      setMessage(`Session metadata deleted: ${idToDelete}`);
      await loadSessions();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedId) {
      return;
    }

    setBusy("agent");
    setError(null);

    try {
      const maxTurnsNumber = Number(agentMaxTurns);
      const response = await fetch(`/api/sessions/${selectedId}/agent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: agentPrompt,
          cwd: cwd.trim() || undefined,
          maxTurns: Number.isFinite(maxTurnsNumber)
            ? Math.max(1, Math.min(20, Math.floor(maxTurnsNumber)))
            : undefined,
        }),
      });
      await ensureResponseOk(response);

      const body = (await response.json()) as ExecResponse;
      setExecResult(body.result);
      setMessage(`Agent finished with exit code ${body.result.exitCode}`);
      await refreshSelected();
    } catch (agentError) {
      setError(
        agentError instanceof Error ? agentError.message : String(agentError),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedId) {
      return;
    }

    setBusy("exec");
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${selectedId}/exec`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cmd: command,
          cwd: cwd.trim() || undefined,
          pty: true,
        }),
      });
      await ensureResponseOk(response);

      const body = (await response.json()) as ExecResponse;
      setExecResult(body.result);
      setMessage(`Command finished with exit code ${body.result.exitCode}`);
      await refreshSelected();
    } catch (execError) {
      setError(
        execError instanceof Error ? execError.message : String(execError),
      );
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy("logout");
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await parseError(response));
      }
      setUser(null);
      setClaudeApiKeyConfigured(false);
      setSessions([]);
      setSelectedId(null);
      setExecResult(null);
      setPendingCreatePayload(null);
      setIsClaudeApiKeyModalOpen(false);
      setClaudeApiKeyInput("");
      setClaudeApiKeyError(null);
      setMessage("Signed out.");
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : String(logoutError),
      );
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("authError");
    if (!authError) {
      return;
    }

    setAuthNotice(`GitHub login failed (${authError}).`);
    params.delete("authError");
    const search = params.toString();
    const nextPath = `${window.location.pathname}${search ? `?${search}` : ""}`;
    window.history.replaceState({}, "", nextPath);
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (!user) {
      setClaudeApiKeyConfigured(false);
      setSessions([]);
      setSelectedId(null);
      return;
    }
    void loadSessions();
  }, [loadSessions, user]);

  useEffect(() => {
    if (!user || !selectedId) {
      return;
    }

    void loadSessionDetail(selectedId).catch((loadError) => {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    });
  }, [loadSessionDetail, selectedId, user]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f5f3e7_0%,_#e0efe9_45%,_#dce8f9_100%)] px-6 py-8 text-slate-900">
        <main className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-900/10 bg-white/80 p-6 shadow-sm backdrop-blur">
          <p className="text-sm text-slate-600">
            Loading authentication state...
          </p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f5f3e7_0%,_#e0efe9_45%,_#dce8f9_100%)] px-6 py-8 text-slate-900">
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <header className="rounded-3xl border border-slate-900/10 bg-white/80 p-6 shadow-sm backdrop-blur">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-600">
              Session Manager
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Cloud Development Sessions
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Sign in with GitHub to create and manage your Sessions.
            </p>
          </header>

          {(authNotice || error) && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {authNotice ?? error}
            </div>
          )}

          <section className="rounded-3xl border border-slate-900/10 bg-white/80 p-6 shadow-sm backdrop-blur">
            <a
              href="/api/auth/github/login"
              className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Sign in with GitHub
            </a>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f5f3e7_0%,_#e0efe9_45%,_#dce8f9_100%)] px-6 py-8 text-slate-900">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-slate-900/10 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-600">
                Session Manager
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Cloud Development Sessions
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-medium">{user.github.login}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Claude API key:{" "}
                {claudeApiKeyConfigured ? "configured" : "not set"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingCreatePayload(null);
                  setClaudeApiKeyError(null);
                  setIsClaudeApiKeyModalOpen(true);
                }}
                disabled={busy !== null || claudeApiKeySaving}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Claude API key settings
              </button>
              <button
                type="button"
                onClick={signOut}
                disabled={busy !== null}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "logout" ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        </header>

        {message ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <section className="rounded-3xl border border-slate-900/10 bg-white/80 p-6 shadow-sm backdrop-blur">
          <h2 className="text-lg font-semibold">Create Session</h2>
          <form
            className="mt-4 grid gap-3 md:grid-cols-4"
            onSubmit={createSession}
          >
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-slate-500"
              placeholder="Session name"
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-slate-500"
              placeholder="Repo URL (optional)"
              value={createForm.repoUrl}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  repoUrl: event.target.value,
                }))
              }
            />
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-slate-500"
              placeholder="Ref (optional, e.g. main)"
              value={createForm.repoRef}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  repoRef: event.target.value,
                }))
              }
            />
            <button
              type="submit"
              disabled={busy !== null}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "create" ? "Creating..." : "Create Session"}
            </button>
          </form>
        </section>

        <section className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="rounded-3xl border border-slate-900/10 bg-white/80 p-5 shadow-sm backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Sessions</h2>
              <button
                type="button"
                onClick={() => loadSessions()}
                disabled={loading || busy !== null}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>

            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No sessions yet.
                </p>
              ) : (
                sessions.map((session) => (
                  <button
                    type="button"
                    key={session.id}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      selectedId === session.id
                        ? "border-slate-900 bg-slate-900/5"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                    onClick={() => {
                      setSelectedId(session.id);
                      setExecResult(null);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{session.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          session.status === "running"
                            ? "bg-emerald-100 text-emerald-800"
                            : session.status === "terminated"
                              ? "bg-slate-200 text-slate-700"
                              : session.status === "error"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {session.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {session.repoUrl}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatTime(session.updatedAt)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-900/10 bg-white/80 p-5 shadow-sm backdrop-blur">
            {!selectedSession ? (
              <p className="text-sm text-slate-600">
                Select a session to manage.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {selectedSession.name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      ID: {selectedSession.id}
                    </p>
                    <p className="text-sm text-slate-600">
                      Workspace: {selectedSession.workspacePath}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={refreshSelected}
                      disabled={busy !== null}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Refresh Status
                    </button>
                    <button
                      type="button"
                      onClick={terminateSession}
                      disabled={
                        busy !== null || selectedSession.status === "terminated"
                      }
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Terminate Session
                    </button>
                    <button
                      type="button"
                      onClick={deleteSession}
                      disabled={busy !== null}
                      className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete Metadata
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 sm:grid-cols-2">
                  <p>
                    <span className="font-semibold text-slate-800">
                      Status:
                    </span>{" "}
                    {selectedSession.status}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Repo ref:
                    </span>{" "}
                    {selectedSession.repoRef}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Created:
                    </span>{" "}
                    {formatTime(selectedSession.createdAt)}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">
                      Updated:
                    </span>{" "}
                    {formatTime(selectedSession.updatedAt)}
                  </p>
                </div>

                {selectedSession.lastError ? (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {selectedSession.lastError}
                  </p>
                ) : null}

                <div className="mt-4 space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
                    SSH Access
                  </h3>
                  {selectedSession.ssh ? (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                      <p>
                        <span className="font-semibold text-slate-900">
                          Command:
                        </span>{" "}
                        <code className="break-all">
                          {selectedSession.ssh.command}
                        </code>
                      </p>
                      <p>
                        <span className="font-semibold text-slate-900">
                          Host key fingerprint:
                        </span>{" "}
                        <code className="break-all">
                          {selectedSession.ssh.hostKeyFingerprint}
                        </code>
                      </p>
                      <p>
                        <span className="font-semibold text-slate-900">
                          known_hosts entry:
                        </span>{" "}
                        <code className="break-all">
                          {selectedSession.ssh.knownHostsEntry}
                        </code>
                      </p>
                    </div>
                  ) : selectedSession.status !== "running" ? (
                    <p className="text-xs text-slate-600">
                      SSH access is available only while the Session is running.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-600">
                      SSH connection details are not ready yet. Click Refresh
                      Status and retry.
                    </p>
                  )}
                </div>

                <form onSubmit={runAgent} className="mt-4 space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
                    Run Claude Agent SDK
                  </h3>
                  <textarea
                    value={agentPrompt}
                    onChange={(event) => setAgentPrompt(event.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-slate-500"
                  />
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={agentMaxTurns}
                      onChange={(event) => setAgentMaxTurns(event.target.value)}
                      className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500"
                      placeholder="max turns"
                      inputMode="numeric"
                    />
                    <button
                      type="submit"
                      disabled={
                        busy !== null || selectedSession.status === "terminated"
                      }
                      className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy === "agent" ? "Running..." : "Run Agent"}
                    </button>
                  </div>
                </form>

                <form onSubmit={runCommand} className="mt-4 space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">
                    Execute Command
                  </h3>
                  <textarea
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-slate-500"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={cwd}
                      onChange={(event) => setCwd(event.target.value)}
                      className="min-w-[220px] flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500"
                      placeholder="working directory"
                    />
                    <button
                      type="submit"
                      disabled={
                        busy !== null || selectedSession.status === "terminated"
                      }
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy === "exec" ? "Running..." : "Run Command"}
                    </button>
                  </div>
                </form>

                {execResult ? (
                  <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">
                    <p className="font-semibold text-slate-300">
                      Exit code: {execResult.exitCode}
                    </p>
                    <div>
                      <p className="mb-1 text-slate-400">stdout</p>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-slate-100">
                        {execResult.stdout || "(empty)"}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-1 text-slate-400">stderr</p>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-rose-200">
                        {execResult.stderr || "(empty)"}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      </main>

      {isClaudeApiKeyModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Configure Claude API key</h2>
            <p className="mt-2 text-sm text-slate-600">
              Save your Claude API key to run agent tasks in your Sessions.
            </p>
            {pendingCreatePayload ? (
              <p className="mt-2 text-xs text-slate-500">
                Session creation will resume after saving this API key.
              </p>
            ) : null}

            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void saveClaudeApiKey();
              }}
            >
              <input
                type="password"
                value={claudeApiKeyInput}
                onChange={(event) => setClaudeApiKeyInput(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500"
                placeholder="Claude API key"
              />
              {claudeApiKeyError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {claudeApiKeyError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsClaudeApiKeyModalOpen(false);
                    setPendingCreatePayload(null);
                    setClaudeApiKeyError(null);
                  }}
                  disabled={claudeApiKeySaving}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={claudeApiKeySaving}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {claudeApiKeySaving ? "Saving..." : "Save API key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
