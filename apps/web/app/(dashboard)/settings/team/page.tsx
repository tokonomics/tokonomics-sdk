"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

type Member = {
  userId: string;
  role: "OWNER" | "ADMIN" | "VIEWER";
  joinedAt: string;
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
};

const ROLE_BADGE: Record<string, string> = {
  OWNER: "bg-brand-50 text-brand-700",
  ADMIN: "bg-blue-50 text-blue-700",
  VIEWER: "bg-muted text-muted-foreground",
};

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "VIEWER">("VIEWER");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((j: { data: Member[] }) => { setMembers(j.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleInvite() {
    if (!inviteEmail) return;
    setInviting(true); setMsg(null);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const json = (await res.json()) as { data?: { status: string; note?: string }; error?: { message: string } };
    setInviting(false);
    if (!res.ok) { setMsg({ type: "err", text: json.error?.message ?? "Failed" }); return; }
    const data = json.data!;
    if (data.status === "added") {
      setMsg({ type: "ok", text: `${inviteEmail} added to the team.` });
      const r2 = await fetch("/api/team");
      const j2 = (await r2.json()) as { data: Member[] };
      setMembers(j2.data ?? []);
    } else {
      setMsg({ type: "ok", text: `Invite recorded. ${data.note ?? ""}` });
    }
    setInviteEmail("");
  }

  async function handleRemove(userId: string, email: string) {
    if (!confirm(`Remove ${email} from the team?`)) return;
    await fetch(`/api/team/${userId}`, { method: "DELETE" });
    setMembers((m) => m.filter((x) => x.userId !== userId));
  }

  async function handleRoleChange(userId: string, role: string) {
    await fetch(`/api/team/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setMembers((m) => m.map((x) => x.userId === userId ? { ...x, role: role as Member["role"] } : x));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="mt-1 text-muted-foreground">Manage who has access to this organization.</p>
      </div>

      {/* Invite */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold">Invite team member</h3>
        <div className="flex gap-3">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === "Enter" && void handleInvite()}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as "ADMIN" | "VIEWER")}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="VIEWER">Viewer</option>
            <option value="ADMIN">Admin</option>
          </select>
          <Button onClick={() => void handleInvite()} disabled={inviting || !inviteEmail}>
            {inviting ? "Inviting…" : "Invite"}
          </Button>
        </div>
        {msg && <p className={`mt-2 text-sm ${msg.type === "ok" ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
        <div className="mt-3 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Roles:</span>{" "}
          Viewer — read-only · Admin — manage integrations &amp; budgets · Owner — full access &amp; billing
        </div>
      </div>

      {/* Members list */}
      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {members.map((m) => (
                <tr key={m.userId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{m.user.name ?? m.user.email}</p>
                      {m.user.name && <p className="text-xs text-muted-foreground">{m.user.email}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {m.role === "OWNER" ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE["OWNER"]}`}>Owner</span>
                    ) : (
                      <select
                        value={m.role}
                        onChange={(e) => void handleRoleChange(m.userId, e.target.value)}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer ${ROLE_BADGE[m.role]}`}
                      >
                        <option value="VIEWER">Viewer</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(m.joinedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.role !== "OWNER" && (
                      <button
                        onClick={() => void handleRemove(m.userId, m.user.email)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
