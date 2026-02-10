"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";
import FeedNav from "@/components/FeedNav";

export default function FollowingFeedPage() {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      const { data } = await supabase.auth.getUser();
      const u = data?.user || null;
      setUser(u);

      if (!u) {
        setPosts([]);
        setLoading(false);
        return;
      }

      // 1) להביא את מי אני עוקב אחריו
      const { data: follows, error: fErr } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", u.id);

      if (fErr) throw fErr;

      const ids = (follows || []).map((x) => x.following_id);

      if (ids.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }

      // 2) להביא פוסטים רק מה-ids האלה
      const { data: rows, error: pErr } = await supabase
        .from("posts")
        .select(
          "id, kind, content, link_url, image_url, created_at, edited_at, edit_history, user_id, profiles:profiles(username, display_name, avatar_url)"
        )
        .in("user_id", ids)
        .order("created_at", { ascending: false })
        .limit(50);

      if (pErr) throw pErr;

      const mapped = (rows || []).map((p) => ({
        id: p.id,
        kind: p.kind,
        content: p.content,
        link_url: p.link_url,
        image_url: p.image_url,
        created_at: p.created_at,
        edited_at: p.edited_at || null,
        edit_history: p.edit_history || null,
        user_id: p.user_id,
        username: p.profiles?.username || "unknown",
        display_name: p.profiles?.display_name || null,
        avatar_url: p.profiles?.avatar_url || null,
      }));

      setPosts(mapped);
    } catch (e) {
      if (e?.name === "AbortError") return; // dev-only
      setErr(e.message || "Failed to load following feed.");
    } finally {
      setLoading(false);
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
        <nav>
          <FeedNav />
          <div className="user">
            <a href="/auth">Sign in</a>
          </div>
        </nav>
        <p>You're not signed in.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <nav>
        <FeedNav />
        <div className="user">
          <a href="/">← Public feed</a>
        </div>
      </nav>

      {err ? <p style={{ color: "crimson" }}>{err}</p> : null}

      {posts.length === 0 ? (
        <p>No posts from people you follow yet.</p>
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={user?.id}
            onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
            onEdit={(id, updates) => setPosts((prev) => prev.map((p) => p.id === id ? { ...p, ...updates } : p))}
          />
        ))
      )}
    </div>
  );
}