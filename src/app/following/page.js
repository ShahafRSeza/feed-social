"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";


export default function FollowingPage() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);

    const { data } = await supabase.auth.getUser();
    const u = data?.user || null;
    setUser(u);

    if (!u) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      // מביא את מי שאני עוקב אחריו + פרטי פרופיל שלהם
      const { data: rows, error } = await supabase
        .from("follows")
        .select("created_at, following_id, profiles:profiles!follows_following_id_fkey(username, display_name, avatar_url)")
        .eq("follower_id", u.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped = (rows || []).map((r) => ({
        following_id: r.following_id,
        created_at: r.created_at,
        username: r.profiles?.username || "unknown",
        display_name: r.profiles?.display_name || null,
        avatar_url: r.profiles?.avatar_url || null,
      }));

      setItems(mapped);
    } catch (e) {
  if (e?.name === "AbortError") return; // להתעלם מהקריסה הזו ב-dev
  setErr(e.message || "Failed to load following list.");
} finally {
  setLoading(false);
}
  }

  async function unfollow(followingId) {
    if (!user) return;

    // אופטימיסטי: מורידים מהמסך מיד
    setItems((prev) => prev.filter((x) => x.following_id !== followingId));

    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", followingId);

    if (error) {
      // אם נכשל נחזיר מחדש ע"י reload
      console.error(error);
      load();
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="container">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container">
        <h1 style={{ marginTop: 0 }}>Following</h1>
        <p>You're not signed in.</p>
        <a href="/auth">Go to sign in</a>
      </div>
    );
  }

  return (
    <div className="container">
      <a href="/" style={{ display: "inline-block", marginBottom: 12 }}>
        ← Back to feed
      </a>

      <h1 style={{ marginTop: 0 }}>Following</h1>

      {err ? <p style={{ color: "crimson" }}>{err}</p> : null}

      {items.length === 0 ? (
        <p>You're not following anyone yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((p) => (
            <div
              key={p.following_id}
              className="post"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt="avatar"
                    className="avatar"
                  />
                ) : (
                  <div
                    className="avatar"
                    style={{ background: "#eee" }}
                  />
                )}

                <div>
                  <div style={{ fontWeight: "bold" }}>
                    <a href={`/u/${p.username}`}>
                      @{p.username}
                    </a>
                  </div>
                  {p.display_name ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {p.display_name}
                    </div>
                  ) : null}
                </div>
              </div>

              <button
                onClick={() => unfollow(p.following_id)}
                className="resetBtn"
                style={{
                  width: "auto",
                  padding: "8px 12px",
                }}
              >
                Unfollow
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}