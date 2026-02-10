"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import AvatarCropModal from "@/components/AvatarCropModal";
import FeedNav from "@/components/FeedNav";

export default function MePage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [msg, setMsg] = useState(null);

  const [avatarFile, setAvatarFile] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);

  useEffect(() => {
    async function load() {
      setMsg(null);
      setLoading(true);

      const { data } = await supabase.auth.getUser();
      const u = data?.user || null;
      setUser(u);

      if (!u) {
        setLoading(false);
        return;
      }

      const { data: prof, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url")
        .eq("id", u.id)
        .maybeSingle();

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      setProfile(prof || null);
      setDisplayName(prof?.display_name || "");
      setBio(prof?.bio || "");
      setLoading(false);
    }

    load();
  }, []);

  async function save() {
    if (!user) return;
    setMsg(null);
    setSaving(true);

    try {
      const payload = {
        display_name: displayName.trim() ? displayName.trim() : null,
        bio: bio.trim() ? bio.trim() : null,
      };

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id);

      if (error) throw error;

      setProfile((p) => ({ ...p, ...payload }));
      setMsg("Saved ✅");
    } catch (e) {
      setMsg(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file) {
    if (!user || !file) return;

    setMsg(null);
    setAvatarUploading(true);

    try {
      const filePath = `${user.id}/avatar.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          upsert: true,
          cacheControl: "3600",
          contentType: file.type || "image/jpeg",
        });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const avatarUrl = data.publicUrl;

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", user.id);

      if (updateErr) throw updateErr;

      setProfile((p) => ({ ...(p || {}), avatar_url: avatarUrl }));
      setMsg("Avatar updated ✅");
    } catch (e) {
      setMsg(e.message || "Failed to upload avatar.");
    } finally {
      setAvatarUploading(false);
    }
  }

  function resetForm() {
    setDisplayName(profile?.display_name || "");
    setBio(profile?.bio || "");
    setMsg(null);
  }

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
        <p>You&#39;re not signed in.</p>
        <a href="/auth">Go to sign in</a>
      </div>
    );
  }

  return (
    <div className="container">
      <nav>
        <FeedNav />
        <div className="user">
          <a href={`/u/${profile?.username}`}>
            {profile?.display_name || `@${profile?.username}`}
          </a>
        </div>
      </nav>

      {/* Profile Card */}
      <div className="userProfileCard">
        <div style={{ position: "relative", width: 140, flexShrink: 0 }}>
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="userAvatar"
              className="profileAvatar"
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
          <label className="avatarUploadLabel">
            <input
              type="file"
              accept="image/*"
              disabled={avatarUploading}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setAvatarFile(f);
                setCropOpen(true);
                e.target.value = "";
              }}
            />
            <span className="avatarUploadOverlay">
              {avatarUploading ? "..." : "EDIT"}
            </span>
          </label>
        </div>
        <div className="content">
          <h2>{profile?.display_name || `@${profile?.username}`}</h2>
          <h3>@{profile?.username}</h3>
          {profile?.bio ? <p>{profile.bio}</p> : null}
        </div>
      </div>

      {/* Edit Form */}
      <h3 className="title">EDIT PROFILE</h3>
      <div className="editProfileForm">
        <label className="editField">
          <span className="editLabel">Display Name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={saving}
            placeholder="Your display name"
          />
        </label>

        <label className="editField">
          <span className="editLabel">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            disabled={saving}
            rows={3}
            placeholder="Write something about yourself"
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={save}
            disabled={saving}
            className="followBtn"
            style={{ flex: 1 }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={resetForm}
            className="resetBtn"
          >
            Reset
          </button>
        </div>

        {msg ? <p style={{ marginTop: 8 }}>{msg}</p> : null}
      </div>

      <AvatarCropModal
        file={avatarFile}
        open={cropOpen}
        onClose={() => {
          setCropOpen(false);
          setAvatarFile(null);
        }}
        onSave={(blob) => {
          setCropOpen(false);
          setAvatarFile(null);
          uploadAvatar(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
        }}
        outputSize={256}
      />
    </div>
  );
}
