"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

/* ─── Constants ─── */
const FONTS = [
  { name: "Roboto Mono", value: '"Roboto Mono", monospace' },
  { name: "Inter", value: '"Inter", sans-serif' },
  { name: "Playfair Display", value: '"Playfair Display", serif' },
  { name: "Space Grotesk", value: '"Space Grotesk", sans-serif' },
  { name: "Caveat", value: '"Caveat", cursive' },
];

const TEXT_COLORS = [
  { name: "Black", value: "#000000" },
  { name: "Red", value: "#f43302" },
  { name: "Orange", value: "#ff8c00" },
  { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#7c3aed" },
  { name: "Pink", value: "#ec4899" },
];

/* ─── XHR upload with progress ─── */
function uploadFileWithProgress(file, bucket, filePath, token, onProgress) {
  return new Promise((resolve, reject) => {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.message || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));

    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Cache-Control", "3600");
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

export default function CreatePost({ onCreated }) {
  /* ─── Core state ─── */
  const [user, setUser] = useState(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  /* ─── Upload progress ─── */
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [postProgress, setPostProgress] = useState(0);

  /* ─── Toolbar state ─── */
  const [showToolbar, setShowToolbar] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);

  /* ─── Link popup ─── */
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");

  /* ─── GIF ─── */
  const [gifSearch, setGifSearch] = useState("");
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);

  /* ─── @Mention ─── */
  const [showMentions, setShowMentions] = useState(false);
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 });

  /* ─── Refs ─── */
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const savedSelection = useRef(null);
  const mentionStart = useRef(null);
  const gifTimeout = useRef(null);
  const mentionTimeout = useRef(null);
  const progressInterval = useRef(null);

  /* ─── Auth ─── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  /* ══════════════════════════════════════════
     Selection helpers
     ══════════════════════════════════════════ */
  function saveSelection() {
    const sel = window.getSelection();
    if (sel?.rangeCount > 0) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const sel = window.getSelection();
    if (savedSelection.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedSelection.current);
    }
  }

  /* ══════════════════════════════════════════
     Editor helpers
     ══════════════════════════════════════════ */
  function getEditorHtml() {
    return editorRef.current?.innerHTML || "";
  }

  function getEditorText() {
    return editorRef.current?.innerText?.trim() || "";
  }

  function handleInput() {
    setIsEmpty(!getEditorText());
    checkForMention();
  }

  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    handleInput();
  }

  /* ══════════════════════════════════════════
     Selection detection
     ══════════════════════════════════════════ */
  function checkSelection() {
    const sel = window.getSelection();
    const selected =
      sel &&
      sel.toString().trim().length > 0 &&
      editorRef.current?.contains(sel.anchorNode);
    setHasSelection(!!selected);
    if (selected) saveSelection();
  }

  function handleMouseUp() {
    setTimeout(() => {
      checkSelection();
      setActiveDropdown(null);
    }, 10);
  }

  function handleKeyUp() {
    checkSelection();
    checkForMention();
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      if (activeDropdown) {
        setActiveDropdown(null);
        return;
      }
      if (showMentions) {
        setShowMentions(false);
        return;
      }
    }
    if (!showMentions) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => Math.min(i + 1, mentionResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (mentionResults[mentionIndex]) {
        e.preventDefault();
        insertMention(mentionResults[mentionIndex]);
      }
    }
  }

  function handleEditorFocus() {
    setShowToolbar(true);
  }

  /* ══════════════════════════════════════════
     Dropdown management
     ══════════════════════════════════════════ */
  function toggleDropdown(name) {
    saveSelection();
    setActiveDropdown((prev) => (prev === name ? null : name));
  }

  const prevent = (e) => e.preventDefault();

  /* ══════════════════════════════════════════
     Font picker
     ══════════════════════════════════════════ */
  function applyFont(fontValue) {
    if (hasSelection) {
      restoreSelection();
      document.execCommand("styleWithCSS", false, true);
      document.execCommand("fontName", false, fontValue);
      document.execCommand("styleWithCSS", false, false);
    } else {
      if (editorRef.current) {
        editorRef.current.style.fontFamily = fontValue;
      }
    }
    setActiveDropdown(null);
    editorRef.current?.focus();
    handleInput();
  }

  /* ══════════════════════════════════════════
     List options (with toggle)
     ══════════════════════════════════════════ */
  function getListState() {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    let node = sel.getRangeAt(0).startContainer;
    while (node && node !== editorRef.current) {
      if (node.nodeType === 1) {
        if (node.tagName === "UL") return "bullet";
        if (node.tagName === "OL") return "numbered";
        if (node.tagName === "BLOCKQUOTE") return "indent";
      }
      node = node.parentNode;
    }
    return null;
  }

  function applyList(type) {
    restoreSelection();
    editorRef.current?.focus();

    if (type === "indent") {
      // Toggle: if already indented, outdent
      if (getListState() === "indent") {
        document.execCommand("outdent");
      } else {
        document.execCommand("indent");
      }
    } else if (type === "bullet") {
      // execCommand insertUnorderedList is already a toggle
      document.execCommand("insertUnorderedList");
    } else if (type === "numbered") {
      // execCommand insertOrderedList is already a toggle
      document.execCommand("insertOrderedList");
    }

    setActiveDropdown(null);
    handleInput();
  }

  /* ══════════════════════════════════════════
     Link popup
     ══════════════════════════════════════════ */
  function openLinkPopup() {
    saveSelection();
    const sel = window.getSelection();
    setLinkText(sel?.toString() || "");
    setLinkUrl("");
    setLinkError("");
    setActiveDropdown("link");
  }

  function normalizeUrl(url) {
    let u = url.trim();
    if (!u) return "";
    if (/^javascript:/i.test(u)) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }

  function isValidUrl(url) {
    try {
      new URL(normalizeUrl(url));
      return true;
    } catch {
      return false;
    }
  }

  function insertLink() {
    if (!linkUrl.trim()) {
      setLinkError("Enter a URL.");
      return;
    }
    if (!isValidUrl(linkUrl)) {
      setLinkError("Invalid URL.");
      return;
    }

    const url = normalizeUrl(linkUrl);
    restoreSelection();
    editorRef.current?.focus();

    const sel = window.getSelection();
    if (hasSelection && sel && !sel.isCollapsed) {
      document.execCommand("createLink", false, url);
      editorRef.current
        .querySelectorAll(`a[href="${url}"]`)
        .forEach((a) => {
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
        });
    } else {
      const text = linkText || url;
      const safeText = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      document.execCommand(
        "insertHTML",
        false,
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${safeText}</a>&nbsp;`
      );
    }

    setActiveDropdown(null);
    setLinkText("");
    setLinkUrl("");
    setLinkError("");
    handleInput();
  }

  /* ══════════════════════════════════════════
     GIF picker (GIPHY API)
     ══════════════════════════════════════════ */
  function openGifPicker() {
    saveSelection();
    setActiveDropdown("gif");
    setGifSearch("");
    setGifResults([]);
    fetchGifs("");
  }

  async function fetchGifs(query) {
    const key = process.env.NEXT_PUBLIC_GIPHY_KEY;
    if (!key) return;
    setGifLoading(true);
    try {
      const endpoint = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(query)}&limit=20&rating=pg`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=20&rating=pg`;
      const res = await fetch(endpoint);
      const json = await res.json();
      setGifResults(json.data || []);
    } catch {
      setGifResults([]);
    } finally {
      setGifLoading(false);
    }
  }

  function handleGifSearchInput(val) {
    setGifSearch(val);
    clearTimeout(gifTimeout.current);
    gifTimeout.current = setTimeout(() => fetchGifs(val), 400);
  }

  function insertGif(gif) {
    const url =
      gif.images?.fixed_height?.url || gif.images?.original?.url;
    if (!url) return;
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<img src="${url}" alt="gif" style="max-width:100%;border-radius:10px;margin-top:8px;display:block;" />`
    );
    setActiveDropdown(null);
    handleInput();
  }

  /* ══════════════════════════════════════════
     Image upload with real progress
     ══════════════════════════════════════════ */
  function handleImageClick() {
    saveSelection();
    fileInputRef.current?.click();
  }

  async function handleImageUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !user) return;

    setUploadingImage(true);
    setUploadProgress(0);
    setMsg(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setMsg("Not authenticated.");
      setUploadingImage(false);
      return;
    }

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop();
        const path = `${user.id}/post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

        await uploadFileWithProgress(
          file,
          "avatars",
          path,
          session.access_token,
          (filePct) => {
            const overall = Math.round((i * 100 + filePct) / files.length);
            setUploadProgress(overall);
          }
        );

        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        restoreSelection();
        editorRef.current?.focus();
        document.execCommand(
          "insertHTML",
          false,
          `<img src="${data.publicUrl}" alt="image" style="max-width:100%;border-radius:10px;margin-top:8px;display:block;" />`
        );
      }

      setUploadProgress(100);
      handleInput();
    } catch (err) {
      setMsg(err.message || "Failed to upload image.");
    } finally {
      setTimeout(() => {
        setUploadingImage(false);
        setUploadProgress(0);
      }, 400);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* ══════════════════════════════════════════
     Text color
     ══════════════════════════════════════════ */
  function applyColor(color) {
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand("styleWithCSS", false, true);
    document.execCommand("foreColor", false, color);
    document.execCommand("styleWithCSS", false, false);
    setActiveDropdown(null);
    handleInput();
  }

  /* ══════════════════════════════════════════
     Bold / Italic / Strikethrough
     ══════════════════════════════════════════ */
  function exec(cmd) {
    restoreSelection();
    document.execCommand(cmd, false, null);
    editorRef.current?.focus();
  }

  /* ══════════════════════════════════════════
     @Mention system
     ══════════════════════════════════════════ */
  function checkForMention() {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) {
      setShowMentions(false);
      return;
    }

    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) {
      setShowMentions(false);
      return;
    }

    const text = node.textContent;
    const cursor = range.startOffset;

    let at = -1;
    for (let i = cursor - 1; i >= 0; i--) {
      if (text[i] === "@") {
        if (i === 0 || /\s/.test(text[i - 1])) {
          at = i;
          break;
        }
      }
      if (/\s/.test(text[i])) break;
    }

    if (at === -1) {
      setShowMentions(false);
      return;
    }

    const query = text.substring(at + 1, cursor);
    mentionStart.current = { node, offset: at, cursor };

    const tempRange = document.createRange();
    tempRange.setStart(node, at);
    tempRange.setEnd(node, cursor);
    const rect = tempRange.getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();
    setMentionPos({
      top: rect.bottom - editorRect.top + 4,
      left: Math.max(0, rect.left - editorRect.left),
    });

    clearTimeout(mentionTimeout.current);
    mentionTimeout.current = setTimeout(async () => {
      try {
        let q = supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .limit(8);
        if (query) q = q.ilike("username", `${query}%`);
        const { data } = await q;
        setMentionResults(data || []);
        setShowMentions((data || []).length > 0);
        setMentionIndex(0);
      } catch {
        setShowMentions(false);
      }
    }, 150);
  }

  function insertMention(profile) {
    const editor = editorRef.current;
    if (!editor || !mentionStart.current) return;

    const { node, offset } = mentionStart.current;
    const sel = window.getSelection();
    const cursor =
      sel?.getRangeAt(0)?.startOffset || node.textContent.length;

    const before = node.textContent.substring(0, offset);
    const after = node.textContent.substring(cursor);

    const beforeNode = document.createTextNode(before);
    const mention = document.createElement("a");
    mention.href = `/u/${profile.username}`;
    mention.className = "mention";
    mention.setAttribute("data-mention", profile.username);
    mention.contentEditable = "false";
    mention.textContent = `@${profile.username}`;
    const afterNode = document.createTextNode("\u00A0" + after);

    const parent = node.parentNode;
    parent.insertBefore(beforeNode, node);
    parent.insertBefore(mention, node);
    parent.insertBefore(afterNode, node);
    parent.removeChild(node);

    const newRange = document.createRange();
    newRange.setStart(afterNode, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setShowMentions(false);
    mentionStart.current = null;
    handleInput();
  }

  /* ══════════════════════════════════════════
     Submit with progress & Reset
     ══════════════════════════════════════════ */
  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!user) {
      setMsg("You must be signed in to post.");
      return;
    }
    if (!getEditorText()) {
      setMsg("Write something first.");
      return;
    }

    setLoading(true);
    setPostProgress(0);

    // Simulated progress — ramps up to ~90% then holds until the insert resolves
    let pct = 0;
    progressInterval.current = setInterval(() => {
      pct += Math.random() * 18 + 4;
      if (pct > 90) pct = 90;
      setPostProgress(Math.round(pct));
    }, 180);

    try {
      const { error } = await supabase.from("posts").insert({
        user_id: user.id,
        kind: "text",
        content: getEditorHtml(),
        link_url: null,
        image_url: null,
      });
      if (error) throw error;

      clearInterval(progressInterval.current);
      setPostProgress(100);

      // Brief flash of 100% before resetting
      await new Promise((r) => setTimeout(r, 350));

      if (editorRef.current) {
        editorRef.current.innerHTML = "";
        editorRef.current.style.fontFamily = "";
      }
      setIsEmpty(true);
      setShowToolbar(false);
      setHasSelection(false);
      setActiveDropdown(null);
      setPostProgress(0);
      if (onCreated) onCreated();
    } catch (err) {
      clearInterval(progressInterval.current);
      setPostProgress(0);
      setMsg(err.message || "Failed to create post.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
      editorRef.current.style.fontFamily = "";
    }
    setIsEmpty(true);
    setMsg(null);
    setShowToolbar(false);
    setHasSelection(false);
    setActiveDropdown(null);
    setShowMentions(false);
  }

  /* ══════════════════════════════════════════
     Render
     ══════════════════════════════════════════ */
  return (
    <div className="createPost">
      <div className="head">
        <p>Create post</p>
      </div>
      <div className="body">
        <form onSubmit={handleSubmit}>
          {/* ── Single-row Toolbar ── */}
          {showToolbar && (
            <div className="editorToolbar">
              {/* Font */}
              <div className="tbGroup">
                <button
                  type="button"
                  className="tbBtn"
                  onMouseDown={prevent}
                  onClick={() => toggleDropdown("font")}
                  title="Font"
                >
                  Aa
                </button>
                {activeDropdown === "font" && (
                  <div className="tbDropdown fontDropdown">
                    {FONTS.map((f) => (
                      <button
                        key={f.name}
                        type="button"
                        className="tbDropItem"
                        style={{ fontFamily: f.value }}
                        onMouseDown={prevent}
                        onClick={() => applyFont(f.value)}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* List */}
              <div className="tbGroup">
                <button
                  type="button"
                  className="tbBtn"
                  onMouseDown={prevent}
                  onClick={() => toggleDropdown("list")}
                  title="Lists"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
                {activeDropdown === "list" && (
                  <div className="tbDropdown">
                    <button
                      type="button"
                      className="tbDropItem"
                      onMouseDown={prevent}
                      onClick={() => applyList("indent")}
                    >
                      &#8627; Indent
                    </button>
                    <button
                      type="button"
                      className="tbDropItem"
                      onMouseDown={prevent}
                      onClick={() => applyList("bullet")}
                    >
                      &bull; Bullet list
                    </button>
                    <button
                      type="button"
                      className="tbDropItem"
                      onMouseDown={prevent}
                      onClick={() => applyList("numbered")}
                    >
                      1. Numbered list
                    </button>
                  </div>
                )}
              </div>

              <div className="tbSep" />

              {/* Bold */}
              <button
                type="button"
                className="tbBtn tbBold"
                onMouseDown={prevent}
                onClick={() => exec("bold")}
                title="Bold"
              >
                B
              </button>

              {/* Italic */}
              <button
                type="button"
                className="tbBtn tbItalic"
                onMouseDown={prevent}
                onClick={() => exec("italic")}
                title="Italic"
              >
                I
              </button>

              {/* Strikethrough */}
              <button
                type="button"
                className="tbBtn tbStrike"
                onMouseDown={prevent}
                onClick={() => exec("strikethrough")}
                title="Strikethrough"
              >
                S
              </button>

              {/* Color */}
              <div className="tbGroup">
                <button
                  type="button"
                  className="tbBtn"
                  onMouseDown={prevent}
                  onClick={() => toggleDropdown("color")}
                  title="Text color"
                >
                  <span className="colorIcon">A</span>
                </button>
                {activeDropdown === "color" && (
                  <div className="tbDropdown colorDropdown">
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        className="colorSwatch"
                        style={{ backgroundColor: c.value }}
                        onMouseDown={prevent}
                        onClick={() => applyColor(c.value)}
                        title={c.name}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="tbSep" />

              {/* Link */}
              <button
                type="button"
                className="tbBtn"
                onMouseDown={prevent}
                onClick={openLinkPopup}
                title="Link"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                </svg>
              </button>

              {/* GIF */}
              <button
                type="button"
                className="tbBtn tbGif"
                onMouseDown={prevent}
                onClick={openGifPicker}
                title="GIF"
              >
                GIF
              </button>

              {/* Image with upload progress */}
              <button
                type="button"
                className={`tbBtn${uploadingImage ? " tbUploading" : ""}`}
                onMouseDown={prevent}
                onClick={handleImageClick}
                disabled={uploadingImage}
                title="Image"
              >
                {uploadingImage ? (
                  <span className="tbProgress">{uploadProgress}%</span>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                )}
              </button>
            </div>
          )}

          {/* ── Link Popup ── */}
          {activeDropdown === "link" && (
            <div className="tbPanel">
              {!hasSelection && (
                <input
                  type="text"
                  placeholder="Link text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  className="tbInput"
                />
              )}
              <input
                type="text"
                placeholder="example.com"
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  setLinkError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    insertLink();
                  }
                }}
                className="tbInput"
                autoFocus
              />
              {linkError && <p className="tbError">{linkError}</p>}
              <div className="tbPanelActions">
                <button
                  type="button"
                  onClick={insertLink}
                  className="tbPanelBtn tbPanelPrimary"
                >
                  Insert
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDropdown(null)}
                  className="tbPanelBtn"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── GIF Picker ── */}
          {activeDropdown === "gif" && (
            <div className="tbPanel gifPanel">
              {!process.env.NEXT_PUBLIC_GIPHY_KEY ? (
                <p className="tbError" style={{ margin: 0 }}>
                  Set NEXT_PUBLIC_GIPHY_KEY in .env.local to enable GIFs.
                  <br />
                  Get a free key at developers.giphy.com
                </p>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Search GIFs..."
                    value={gifSearch}
                    onChange={(e) => handleGifSearchInput(e.target.value)}
                    className="tbInput"
                    autoFocus
                  />
                  <div className="gifGrid">
                    {gifLoading && <p className="gifMsg">Loading...</p>}
                    {!gifLoading &&
                      gifResults.length === 0 &&
                      gifSearch && <p className="gifMsg">No GIFs found.</p>}
                    {gifResults.map((gif) => (
                      <img
                        key={gif.id}
                        src={
                          gif.images?.fixed_height_small?.url ||
                          gif.images?.fixed_height?.url
                        }
                        alt={gif.title}
                        className="gifItem"
                        onClick={() => insertGif(gif)}
                      />
                    ))}
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => setActiveDropdown(null)}
                className="tbPanelBtn"
                style={{ marginTop: 4, width: "100%" }}
              >
                Close
              </button>
            </div>
          )}

          {/* ── Hidden file input (multiple) ── */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            style={{ display: "none" }}
          />

          {/* ── Editor ── */}
          <div style={{ position: "relative" }}>
            {isEmpty && (
              <div className="editorPlaceholder">Write something...</div>
            )}
            <div
              ref={editorRef}
              className="richEditor"
              contentEditable={!loading}
              onInput={handleInput}
              onPaste={handlePaste}
              onFocus={handleEditorFocus}
              onMouseUp={handleMouseUp}
              onKeyUp={handleKeyUp}
              onKeyDown={handleKeyDown}
              suppressContentEditableWarning
            />

            {/* ── @Mention dropdown ── */}
            {showMentions && mentionResults.length > 0 && (
              <div
                className="mentionDropdown"
                style={{ top: mentionPos.top, left: mentionPos.left }}
              >
                {mentionResults.map((p, i) => (
                  <div
                    key={p.id}
                    className={`mentionItem${i === mentionIndex ? " mentionActive" : ""}`}
                    onMouseDown={prevent}
                    onClick={() => insertMention(p)}
                    onMouseEnter={() => setMentionIndex(i)}
                  >
                    {p.avatar_url ? (
                      <img
                        src={p.avatar_url}
                        alt=""
                        className="mentionAvatar"
                      />
                    ) : (
                      <div className="mentionAvatar mentionAvatarEmpty" />
                    )}
                    <div>
                      <span className="mentionName">
                        {p.display_name || p.username}
                      </span>
                      <span className="mentionUsername">@{p.username}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Buttons ── */}
          <button type="submit" disabled={loading} className="postBtn">
            {loading ? `Posting... ${postProgress}%` : "Post"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            className="resetBtn"
          >
            Reset
          </button>

          {msg && (
            <p style={{ color: "crimson", margin: "8px 0 0" }}>{msg}</p>
          )}
        </form>
      </div>
    </div>
  );
}
