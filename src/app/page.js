"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import CreatePost from "@/components/CreatePost";
import PostCard from "@/components/PostCard";
import FeedNav from "@/components/FeedNav";

export default function HomePage() {
  const [user, setUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  async function loadPosts() {
    setErr(null);
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, kind, content, link_url, image_url, created_at, edited_at, edit_history, user_id, profiles:profiles(username, display_name, avatar_url)"
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const mapped = (data || []).map((p) => ({
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
      setErr(e.message || "Failed to load posts.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMyProfile(u) {
    if (!u) {
      setMyProfile(null);
      return;
    }

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", u.id)
      .maybeSingle();

    if (profErr) {
      console.error(profErr);
      setMyProfile(null);
      return;
    }

    setMyProfile(prof || null);
  }

  useEffect(() => {
    // מי מחובר עכשיו?
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data?.user || null;
      setUser(u);
      await loadMyProfile(u);
    });

    // להאזין לשינויים ב-auth (login/logout)
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user || null;
        setUser(u);
        await loadMyProfile(u);
      }
    );

    loadPosts();

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePostDelete(postId) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  function handlePostEdit(postId, updates) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, ...updates } : p))
    );
  }

  return (
    <div className="container">
      <nav>
        <FeedNav />
        <div className="user">
          {user ? (
            <>
              {myProfile ? (
                <a href={`/u/${myProfile.username}`}>
                  {myProfile.display_name || `@${myProfile.username}`}
                </a>
              ) : (
                <a href="/me">My Profile</a>
              )}
            </>
          ) : (
            <a href="/auth">Sign in</a>
          )}
        </div>
      </nav>

      {user ? <CreatePost onCreated={loadPosts} /> : null}

      {loading ? <p>Loading…</p> : null}
      {err ? <p style={{ color: "crimson" }}>{err}</p> : null}

      {!loading && !err && posts.length === 0 ? <p>No posts yet.</p> : null}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={user?.id}
          onDelete={handlePostDelete}
          onEdit={handlePostEdit}
        />
      ))}
    </div>
  );
}