"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

function normalizeUsername(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const normalizedUsername = useMemo(
    () => normalizeUsername(username),
    [username]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        router.push("/");
      }
    });
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        router.push("/");
        return;
      }

      // signup
      if (normalizedUsername.length < 3) {
        setMessage("Username must be at least 3 characters.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;

      const user = data?.user;
      if (!user) {
        setMessage("Check your email to confirm, then sign in.");
        return;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          username: normalizedUsername,
          display_name: displayName || null,
        });

      if (profileError) {
        console.error(profileError);
        setMessage("Username might be taken. Try another one.");
        return;
      }

      router.push("/");
    } catch (err) {
      setMessage(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="post"
      style={{
        padding: 16,
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setMode("signin")}
          disabled={loading}
          className={mode === "signin" ? "postBtn" : "resetBtn"}
          style={{
            width: "auto",
            padding: "8px 12px",
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          disabled={loading}
          className={mode === "signup" ? "postBtn" : "resetBtn"}
          style={{
            width: "auto",
            padding: "8px 12px",
          }}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
        {mode === "signup" && (
          <>
            <input
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              style={{
                padding: 10,
                border: "none",
                outline: "none",
                backgroundColor: "var(--grey)",
              }}
            />
            <input
              placeholder="display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={loading}
              style={{
                padding: 10,
                border: "none",
                outline: "none",
                backgroundColor: "var(--grey)",
              }}
            />
          </>
        )}

        <input
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          style={{
            padding: 10,
            border: "none",
            outline: "none",
            backgroundColor: "var(--grey)",
          }}
        />

        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          style={{
            padding: 10,
            border: "none",
            outline: "none",
            backgroundColor: "var(--grey)",
          }}
        />

        <button
          type="submit"
          disabled={loading}
          className="postBtn"
          style={{ width: "100%" }}
        >
          {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Sign up"}
        </button>

        {message && (
          <p style={{ color: "crimson", fontSize: 14 }}>{message}</p>
        )}
      </form>
    </div>
  );
}