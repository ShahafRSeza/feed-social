"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function FollowButton({ targetUserId }) {
  const [me, setMe] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      setMe(user);

      if (!user || !targetUserId || user.id === targetUserId) {
        setLoading(false);
        return;
      }

      const { data: follow } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId)
        .maybeSingle();

      setIsFollowing(!!follow);
      setLoading(false);
    }
    load();
  }, [targetUserId]);

  async function toggleFollow() {
    if (!me) return;

    setLoading(true);
    if (isFollowing) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", me.id)
        .eq("following_id", targetUserId);
      setIsFollowing(false);
    } else {
      await supabase.from("follows").insert({
        follower_id: me.id,
        following_id: targetUserId,
      });
      setIsFollowing(true);
    }
    setLoading(false);
  }

  if (loading || !me || me.id === targetUserId) return null;

  return (
    <button
      onClick={toggleFollow}
      className={isFollowing ? "unfollowBtn" : "followBtn"}
    >
      {isFollowing ? "Unfollow" : "Follow"}
    </button>
  );
}