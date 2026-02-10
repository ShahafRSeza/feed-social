"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import ImageModal from "@/components/ImageModal";

/* ── Detect whether stored content is HTML (new posts) vs markdown (old posts) ── */
function isHtmlContent(content) {
  return /<(b|strong|i|em|a\s|a>|br|div|img\s|p>|p\s)/i.test(content);
}

/* ── Sanitize HTML to allow only safe tags/attributes ── */
function sanitizeHtml(html) {
  // Basic script/event-handler stripping (works during SSR too)
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\bon\w+\s*=/gi, "data-removed=");

  if (typeof document === "undefined") return clean;

  const SAFE_STYLE_PROPS = ["font-family", "color", "max-width", "border-radius", "margin-top", "display", "margin-left"];

  function sanitizeStyle(style) {
    const parts = style.split(";").map(s => s.trim()).filter(Boolean);
    const safe = parts.filter(part => {
      const prop = part.split(":")[0]?.trim().toLowerCase();
      return SAFE_STYLE_PROPS.includes(prop);
    });
    return safe.length > 0 ? safe.join("; ") : null;
  }

  const ALLOWED = {
    B: [],
    STRONG: [],
    I: [],
    EM: [],
    S: [],
    STRIKE: [],
    DEL: [],
    A: ["href", "target", "rel", "class", "data-mention"],
    BR: [],
    DIV: ["style"],
    P: [],
    IMG: ["src", "alt", "style"],
    SPAN: ["style"],
    UL: [],
    OL: [],
    LI: [],
    BLOCKQUOTE: [],
    FONT: ["face", "color"],
  };

  const doc = new DOMParser().parseFromString(clean, "text/html");

  function walk(parent) {
    let i = 0;
    while (i < parent.childNodes.length) {
      const node = parent.childNodes[i];
      if (node.nodeType === 3) {
        i++;
        continue;
      }
      if (node.nodeType === 1) {
        if (!ALLOWED.hasOwnProperty(node.tagName)) {
          // Unwrap: keep children, remove the tag
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          parent.removeChild(node);
          // don't increment — re-check position
        } else {
          const allowed = ALLOWED[node.tagName];
          for (const attr of Array.from(node.attributes)) {
            if (!allowed.includes(attr.name)) node.removeAttribute(attr.name);
          }
          if (node.tagName === "A") {
            const href = (node.getAttribute("href") || "").trim();
            if (href.toLowerCase().startsWith("javascript:")) {
              node.setAttribute("href", "#");
            }

            node.setAttribute("rel", "noopener noreferrer");
          }
          if ((node.tagName === "SPAN" || node.tagName === "DIV") && node.hasAttribute("style")) {
            const safe = sanitizeStyle(node.getAttribute("style"));
            if (safe) node.setAttribute("style", safe);
            else node.removeAttribute("style");
          }
          walk(node);
          i++;
        }
      } else {
        parent.removeChild(node);
      }
    }
  }

  walk(doc.body);
  return doc.body.innerHTML;
}

/* ── Legacy markdown formatter (for old posts stored as markdown) ── */
function FormattedContent({ content }) {
  if (!content) return null;

  // New HTML content → sanitize and render directly
  if (isHtmlContent(content)) {
    return <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />;
  }

  // Old markdown content → parse as before
  const processText = (text) => {
    const elements = [];
    let key = 0;

    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let imageMatch;
    let lastImgIndex = 0;

    while ((imageMatch = imageRegex.exec(text)) !== null) {
      if (imageMatch.index > lastImgIndex) {
        elements.push(
          <span key={`text-${key++}`}>
            {processInlineFormatting(text.substring(lastImgIndex, imageMatch.index))}
          </span>
        );
      }

      elements.push(
        <ClickableImage
          key={`img-${key++}`}
          src={imageMatch[2]}
          alt={imageMatch[1]}
          style={{ maxWidth: "100%", borderRadius: 10, marginTop: 8, display: "block", cursor: "pointer" }}
        />
      );

      lastImgIndex = imageRegex.lastIndex;
    }

    if (lastImgIndex < text.length) {
      elements.push(
        <span key={`text-${key++}`}>
          {processInlineFormatting(text.substring(lastImgIndex))}
        </span>
      );
    }

    return elements.length > 0 ? elements : processInlineFormatting(text);
  };

  const processInlineFormatting = (text) => {
    const elements = [];
    let remaining = text;
    let key = 0;

    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/;
    const boldRegex = /\*\*([^*]+)\*\*/;
    const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/;

    while (remaining) {
      const linkMatch = linkRegex.exec(remaining);
      const boldMatch = boldRegex.exec(remaining);
      const italicMatch = italicRegex.exec(remaining);

      const matches = [
        { match: linkMatch, type: "link" },
        { match: boldMatch, type: "bold" },
        { match: italicMatch, type: "italic" },
      ].filter((m) => m.match !== null);

      if (matches.length === 0) {
        elements.push(remaining);
        break;
      }

      matches.sort((a, b) => a.match.index - b.match.index);
      const first = matches[0];

      if (first.match.index > 0) {
        elements.push(
          <span key={`plain-${key++}`}>{remaining.substring(0, first.match.index)}</span>
        );
      }

      if (first.type === "link") {
        elements.push(
          <a
            key={`link-${key++}`}
            href={first.match[2]}
            target="_blank"
            rel="noreferrer"
          >
            {first.match[1]}
          </a>
        );
      } else if (first.type === "bold") {
        elements.push(<strong key={`bold-${key++}`}>{first.match[1]}</strong>);
      } else if (first.type === "italic") {
        elements.push(<em key={`italic-${key++}`}>{first.match[1]}</em>);
      }

      remaining = remaining.substring(first.match.index + first.match[0].length);
    }

    return elements;
  };

  return <>{processText(content)}</>;
}

function ClickableImage({ src, alt, style }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img src={src} alt={alt} style={style} className="postImg" onClick={() => setOpen(true)} />
      {open && <ImageModal src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

export default function PostCard({ post, currentUserId, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editRef = useRef(null);
  const isOwner = currentUserId && post.user_id === currentUserId;

  function startEdit() {
    setEditing(true);
    requestAnimationFrame(() => {
      if (editRef.current) {
        editRef.current.innerHTML = post.content || "";
        editRef.current.focus();
      }
    });
  }

  function cancelEdit() {
    setEditing(false);
  }

  function handleEditPaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  async function saveEdit() {
    const htmlContent = editRef.current?.innerHTML || "";
    const textContent = editRef.current?.innerText?.trim() || "";
    if (!textContent) return;
    setSaving(true);

    try {
      const prevHistory = post.edit_history || [];
      const newHistory = [
        ...prevHistory,
        { content: post.content, edited_at: post.edited_at || post.created_at },
      ];

      const { error } = await supabase
        .from("posts")
        .update({
          content: htmlContent,
          edited_at: new Date().toISOString(),
          edit_history: newHistory,
        })
        .eq("id", post.id);

      if (error) throw error;

      if (onEdit) {
        onEdit(post.id, {
          content: htmlContent,
          edited_at: new Date().toISOString(),
          edit_history: newHistory,
        });
      }
      setEditing(false);
    } catch (e) {
      alert(e.message || "Failed to save edit.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      const { error } = await supabase.from("posts").delete().eq("id", post.id);
      if (error) throw error;
      if (onDelete) onDelete(post.id);
    } catch (e) {
      alert(e.message || "Failed to delete post.");
    }
    setConfirmDelete(false);
  }

  return (
    <div className="post">
      <div className="postHead">
        <a href={`/u/${post.username}`}>
          {post.avatar_url ? (
            <img src={post.avatar_url} alt="avatar" className="avatar" />
          ) : (
            <div className="avatar" style={{ background: "#eee" }} />
          )}
        </a>
        <div className="userDetails">
          <p>
            <a href={`/u/${post.username}`} className="userName">
              {post.display_name || `@${post.username}`}
            </a>
          </p>
          <p>
            <span>
              @{post.username} • {new Date(post.created_at).toLocaleString()}
              {post.edited_at && (
                <>
                  {" "}•{" "}
                  <span
                    className="editedLabel"
                    onClick={() => setShowHistory(!showHistory)}
                  >
                    edited
                  </span>
                </>
              )}
            </span>
          </p>
        </div>

        {isOwner && !editing && (
          <div className="postActions">
            <button onClick={startEdit} className="postActionBtn">Edit</button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="postActionBtn postActionDelete"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="postConfirmDelete">
          <span>Delete this post?</span>
          <button onClick={handleDelete} className="postActionBtn postActionDelete">Yes</button>
          <button onClick={() => setConfirmDelete(false)} className="postActionBtn">No</button>
        </div>
      )}

      {/* Edit history */}
      {showHistory && post.edit_history && post.edit_history.length > 0 && (
        <div className="editHistory">
          <p className="editHistoryTitle">Previous versions:</p>
          {post.edit_history.map((entry, i) => (
            <div key={i} className="editHistoryEntry">
              <span className="editHistoryDate">
                {new Date(entry.edited_at).toLocaleString()}
              </span>
              <p>{entry.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="postBody">
        {editing ? (
          <div className="postEditForm">
            <div
              ref={editRef}
              className="richEditor"
              contentEditable={!saving}
              onPaste={handleEditPaste}
              suppressContentEditableWarning
            />
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={saveEdit} disabled={saving} className="followBtn" style={{ padding: "6px 12px", fontSize: "9pt" }}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button onClick={cancelEdit} disabled={saving} className="resetBtn" style={{ padding: "6px 12px", fontSize: "9pt" }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {post.kind === "text" && post.content && (
              <div>
                <FormattedContent content={post.content} />
              </div>
            )}

            {post.kind === "link" && post.link_url && (
              <div>
                <a href={post.link_url} target="_blank" rel="noreferrer">
                  {post.link_url}
                </a>
                {post.content ? (
                  <span>
                    {" "}
                    — <FormattedContent content={post.content} />
                  </span>
                ) : null}
              </div>
            )}

            {post.kind === "image" && post.image_url && (
              <div>
                {post.content ? (
                  <div>
                    <FormattedContent content={post.content} />
                  </div>
                ) : null}
                <ClickableImage
                  src={post.image_url}
                  alt="post"
                  style={{ width: "100%", borderRadius: 10, marginTop: 8, cursor: "pointer" }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
