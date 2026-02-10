"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";
import FollowButton from "@/components/FollowButton";
import FeedNav from "@/components/FeedNav";
import ImageModal from "@/components/ImageModal";

export default function UserProfileClient({ username }) {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [me, setMe] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [avatarModal, setAvatarModal] = useState(false);

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, created_at")
        .eq("username", username)
        .maybeSingle();

      if (profErr) throw profErr;

      if (!prof) {
        setProfile(null);
        setPosts([]);
        setFollowers([]);
        return;
      }

      setProfile(prof);

      // Fetch posts
      const { data: p, error: postsErr } = await supabase
        .from("posts")
        .select(
          "id, kind, content, link_url, image_url, created_at, edited_at, edit_history, user_id, profiles:profiles(username, display_name, avatar_url)"
        )
        .eq("user_id", prof.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (postsErr) throw postsErr;

      const mapped = (p || []).map((x) => ({
        id: x.id,
        kind: x.kind,
        content: x.content,
        link_url: x.link_url,
        image_url: x.image_url,
        created_at: x.created_at,
        edited_at: x.edited_at || null,
        edit_history: x.edit_history || null,
        user_id: x.user_id,
        username: x.profiles?.username || prof.username,
        display_name: x.profiles?.display_name || prof.display_name || null,
        avatar_url: x.profiles?.avatar_url || prof.avatar_url || null,
      }));

      setPosts(mapped);

      // Fetch followers (people who follow this user)
      const { data: followData, error: followErr } = await supabase
        .from("follows")
        .select("follower_id, profiles:profiles!follows_follower_id_fkey(username, display_name, avatar_url)")
        .eq("following_id", prof.id)
        .limit(10);

      if (!followErr && followData) {
        setFollowers(
          followData.map((f) => ({
            username: f.profiles?.username,
            display_name: f.profiles?.display_name,
            avatar_url: f.profiles?.avatar_url,
          }))
        );
      }

      // Get follower count
      const { count, error: countErr } = await supabase
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", prof.id);

      if (!countErr) {
        setFollowerCount(count || 0);
      }
    } catch (e) {
      setErr(e.message || "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    supabase.auth.getUser().then(async ({ data }) => {
      const u = data?.user || null;
      setMe(u);
      if (u) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("username, display_name")
          .eq("id", u.id)
          .maybeSingle();
        setMyProfile(prof || null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const isOwnProfile = me && profile && me.id === profile.id;

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function handlePostDelete(postId) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  function handlePostEdit(postId, updates) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, ...updates } : p))
    );
  }

  const formatCount = (n) => {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
    return n.toLocaleString();
  };

  return (
    <div className="container">
      <nav>
        <FeedNav />
        <div className="user">
          {me ? (
            myProfile ? (
              <a href={`/u/${myProfile.username}`}>
                {myProfile.display_name || `@${myProfile.username}`}
              </a>
            ) : (
              <a href="/me">My Profile</a>
            )
          ) : (
            <a href="/auth">Sign in</a>
          )}
        </div>
      </nav>

      {loading ? <p>Loading…</p> : null}
      {err ? <p style={{ color: "crimson" }}>{err}</p> : null}

      {!loading && !err && !profile ? <p>User not found.</p> : null}

      {profile ? (
        <>
          {/* Profile Card */}
          <div className="userProfileCard">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="userAvatar"
                className="profileAvatar"
                style={{ cursor: "pointer" }}
                onClick={() => setAvatarModal(true)}
              />
            ) : (
              <div
                className="profileAvatar"
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: 10,
                  background: "#eee",
                }}
              />
            )}
            {avatarModal && profile.avatar_url && (
              <ImageModal
                src={profile.avatar_url}
                alt="userAvatar"
                onClose={() => setAvatarModal(false)}
              />
            )}
            <div className="content">
              <h2>{profile.display_name || `@${profile.username}`}</h2>
              <h3>@{profile.username}</h3>
              <div className="mobile">
                {isOwnProfile ? (
                  <div className="profileActions">
                    <a href="/me" className="editBtn" style={{ textAlign: "center" }}>Edit</a>
                    <button onClick={handleLogout} className="logoutBtn" style={{ marginTop: 4 }}>Logout</button>
                  </div>
                ) : (
                  <FollowButton targetUserId={profile.id} />
                )}
              </div>
              {profile.bio ? <p>{profile.bio}</p> : null}
              <div className="statsRow">
                <div className="stat">
                  <p className="number">{formatCount(posts.length)}</p>
                  <p>POSTS</p>
                </div>
                <div className="stat">
                  <p className="number">{formatCount(followerCount)}</p>
                  <p>FOLLOWERS</p>
                </div>
              </div>
            </div>
            <div className="actions desktop">
              {isOwnProfile ? (
                <>
                  <a href="/me" className="followBtn" style={{ textAlign: "center" }}>Edit</a>
                  <button onClick={handleLogout} className="unfollowBtn" style={{ marginTop: 4 }}>Logout</button>
                </>
              ) : (
                <FollowButton targetUserId={profile.id} />
              )}
            </div>
          </div>

          {/* Followers Section */}
          {followers.length > 0 && (
            <>
              <div className="divTitle">
                <h3 className="title">FOLLOWERS</h3>
                {followerCount > followers.length && (
                  <a href={`/u/${username}/followers`}>View All</a>
                )}
              </div>
              <div className="box">
                {followers.map((f) => (
                  <div className="boxUser" key={f.username}>
                    <div className="boxUserDetails">
                      <a href={`/u/${f.username}`}>
                        {f.avatar_url ? (
                          <img
                            src={f.avatar_url}
                            alt="avatar"
                            className="avatar"
                          />
                        ) : (
                          <img
                            src="/noPrp.png"
                            alt="avatar"
                            className="avatar"
                          />
                        )}
                      </a>
                      <p>
                        <a href={`/u/${f.username}`}>
                          {f.display_name || f.username}
                        </a>
                      </p>
                      <p>
                        <span>@{f.username}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Posts Section */}
          <h3 className="title">ALL POSTS</h3>
          {posts.length === 0 ? <p>No posts yet.</p> : null}
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={me?.id}
              onDelete={handlePostDelete}
              onEdit={handlePostEdit}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
