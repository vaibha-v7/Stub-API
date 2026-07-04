import { useState, useEffect, useRef } from "react";

const API_BASE = "/api/endpoints";
const MOCK_BASE = "/mock";

// Helper to generate UUID for session mapping
const generateUUID = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Format method for displaying on short badges
const formatMethod = (method) => {
  if (!method) return "";
  const upper = method.toUpperCase();
  if (upper === "DELETE") return "DEL";
  return upper;
};

// CSS colors matching standard endpoint methods
const getMethodBadgeClass = (method) => {
  const m = method ? method.toUpperCase() : "GET";
  if (m === "GET") return "bg-green-500/20 text-green-400 border border-green-500/30";
  if (m === "POST") return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
  if (m === "PUT" || m === "PATCH") return "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
  return "bg-red-500/20 text-red-400 border border-red-500/30";
};

// Syntax highlighter function for JSON view
const highlightJson = (json) => {
  if (!json) return "";
  let formatted = typeof json === "string" ? json : JSON.stringify(json, null, 2);
  // Escape HTML tags
  formatted = formatted.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Regexp matching keys, strings, booleans, numbers, nulls
  return formatted.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "text-on-surface";
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "code-key font-semibold";
        } else {
          cls = "code-string font-medium";
        }
      } else if (/true|false/.test(match)) {
        cls = "code-boolean font-semibold";
      } else if (/null/.test(match)) {
        cls = "code-null font-semibold";
      } else {
        cls = "code-number font-medium";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
};

export default function App() {
  // App states
  const [endpoints, setEndpoints] = useState([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [activeTab, setActiveTab] = useState("response");

  // AI Chat generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiSessionId, setAiSessionId] = useState("");
  const [aiMessages, setAiMessages] = useState([]);
  const [aiReplyText, setAiReplyText] = useState("");

  // Modals state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [pendingEndpoint, setPendingEndpoint] = useState({ name: "", method: "GET", fields: [] });

  // Manual creation state
  const [manualName, setManualName] = useState("");
  const [manualMethod, setManualMethod] = useState("GET");
  const [manualFields, setManualFields] = useState([""]);

  // Controls inline edit & save states
  const [editingLatency, setEditingLatency] = useState(false);
  const [tempLatency, setTempLatency] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copyStatus, setCopyStatus] = useState(null); // 'base' | 'mock' | null
  const [saveStatus, setSaveStatus] = useState("Saved");

  // Scroll ref for chat window
  const chatEndRef = useRef(null);

  // Fetch all endpoints from database
  const fetchEndpoints = async (selectNewId = null) => {
    try {
      const res = await fetch(API_BASE);
      const data = await res.json();
      setEndpoints(data);

      if (selectNewId) {
        const found = data.find(e => e._id === selectNewId);
        if (found) setSelectedEndpoint(found);
      } else if (data.length > 0 && !selectedEndpoint) {
        setSelectedEndpoint(data[0]);
      } else if (selectedEndpoint) {
        // Keep active endpoint details synced
        const synced = data.find(e => e._id === selectedEndpoint._id);
        setSelectedEndpoint(synced || (data.length > 0 ? data[0] : null));
      }
    } catch (err) {
      console.error("Error loading endpoints:", err);
    }
  };

  useEffect(() => {
    fetchEndpoints();
  }, []);

  // Scroll to bottom of chat when new message is posted
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiMessages]);

  // Initial call or continuation call to AI endpoint chat
  const handleAiSubmit = async (e, customPrompt = null) => {
    if (e) e.preventDefault();
    const promptToSend = customPrompt || aiPrompt;
    if (!promptToSend.trim()) return;

    let sessId = aiSessionId;
    if (!sessId) {
      sessId = generateUUID();
      setAiSessionId(sessId);
    }

    setIsGenerating(true);
    const updatedMessages = [...aiMessages, { role: "user", content: promptToSend }];
    setAiMessages(updatedMessages);

    // Reset standard input textarea
    if (!customPrompt) {
      setAiPrompt("");
    } else {
      setAiReplyText("");
    }

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessId, message: promptToSend }),
      });

      if (!res.ok) {
        throw new Error("Chat generation request failed");
      }

      const data = await res.json();

      if (data.done) {
        // Extract default endpoint path (starts with /) from chat history
        let defaultPath = "/my-endpoint";
        const allUserInputs = updatedMessages.filter(m => m.role === "user").map(m => m.content);
        for (const input of allUserInputs) {
          const match = input.match(/\/[a-zA-Z0-9_\-]+/);
          if (match) {
            defaultPath = match[0];
            break;
          }
        }

        setPendingEndpoint({
          name: defaultPath,
          method: "GET",
          fields: data.fields || [],
        });
        setShowConfirmModal(true);

        // Reset chat states
        setAiSessionId("");
        setAiMessages([]);
      } else {
        // AI has a clarifying question
        setAiMessages([...updatedMessages, { role: "assistant", content: data.message }]);
      }
    } catch (err) {
      console.error(err);
      alert("AI generator error: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Cancel current AI session
  const cancelAiSession = () => {
    setAiSessionId("");
    setAiMessages([]);
    setAiPrompt("");
    setAiReplyText("");
  };

  // Submit AI confirmation modal
  const handleConfirmCreate = async () => {
    if (!pendingEndpoint.name.trim()) {
      alert("Endpoint path is required.");
      return;
    }
    let path = pendingEndpoint.name.trim();
    if (!path.startsWith("/")) {
      path = "/" + path;
    }

    const cleanFields = pendingEndpoint.fields
      .map(f => ({ name: f.name.trim() }))
      .filter(f => f.name !== "");

    if (cleanFields.length === 0) {
      alert("Please keep/add at least one field.");
      return;
    }

    try {
      setSaveStatus("Saving...");
      const res = await fetch(`${API_BASE}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: path,
          method: pendingEndpoint.method,
          fields: cleanFields,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to register endpoint");
      }

      const created = await res.json();
      await fetchEndpoints(created._id);
      setShowConfirmModal(false);
      setSaveStatus("Saved");
    } catch (err) {
      console.error(err);
      alert("Error confirming endpoint: " + err.message);
      setSaveStatus("Error");
    }
  };

  // Submit manual creation modal
  const handleManualCreate = async () => {
    if (!manualName.trim()) {
      alert("Endpoint path is required.");
      return;
    }
    let path = manualName.trim();
    if (!path.startsWith("/")) {
      path = "/" + path;
    }

    const cleanFields = manualFields
      .map(f => f.trim())
      .filter(f => f !== "")
      .map(f => ({ name: f }));

    if (cleanFields.length === 0) {
      alert("Please provide at least one field.");
      return;
    }

    try {
      setSaveStatus("Saving...");
      const res = await fetch(`${API_BASE}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: path,
          method: manualMethod,
          fields: cleanFields,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save endpoint");
      }

      const created = await res.json();
      await fetchEndpoints(created._id);
      setShowManualModal(false);

      // Clear manual forms
      setManualName("");
      setManualMethod("GET");
      setManualFields([""]);
      setSaveStatus("Saved");
    } catch (err) {
      console.error(err);
      alert("Error creating endpoint: " + err.message);
      setSaveStatus("Error");
    }
  };

  // Edit fields dynamically in AI confirmation form
  const updateConfirmField = (idx, value) => {
    const updated = [...pendingEndpoint.fields];
    updated[idx] = { name: value };
    setPendingEndpoint({ ...pendingEndpoint, fields: updated });
  };

  const addConfirmField = () => {
    setPendingEndpoint({
      ...pendingEndpoint,
      fields: [...pendingEndpoint.fields, { name: "" }],
    });
  };

  const removeConfirmField = (idx) => {
    const updated = pendingEndpoint.fields.filter((_, i) => i !== idx);
    setPendingEndpoint({ ...pendingEndpoint, fields: updated });
  };

  // Edit manual fields dynamically
  const updateManualField = (idx, value) => {
    const updated = [...manualFields];
    updated[idx] = value;
    setManualFields(updated);
  };

  const addManualField = () => {
    setManualFields([...manualFields, ""]);
  };

  const removeManualField = (idx) => {
    const updated = manualFields.filter((_, i) => i !== idx);
    setManualFields(updated.length === 0 ? [""] : updated);
  };

  // Update specific fields of endpoint (latency or forceError)
  const updateControls = async (updates) => {
    if (!selectedEndpoint) return;
    try {
      setSaveStatus("Saving...");
      const res = await fetch(`${API_BASE}/${selectedEndpoint._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        throw new Error("Failed to update settings");
      }

      const updated = await res.json();
      setSelectedEndpoint(updated);
      setEndpoints(endpoints.map(e => e._id === selectedEndpoint._id ? updated : e));
      setSaveStatus("Saved");
    } catch (err) {
      console.error(err);
      alert("Failed to update controls: " + err.message);
      setSaveStatus("Error");
    }
  };

  // Latency field confirm
  const saveLatency = () => {
    setEditingLatency(false);
    const num = parseInt(tempLatency, 10);
    if (isNaN(num) || num < 0) {
      alert("Latency must be a non-negative number.");
      return;
    }
    updateControls({ latencyMs: num });
  };

  // Toggling Force Error checkbox
  const toggleForceError = (isChecked) => {
    const errVal = isChecked ? 500 : null;
    updateControls({ forceError: errVal });
  };

  // Delete endpoint by ID (defaults to selectedEndpoint)
  const deleteEndpoint = async (id = null) => {
    const isStringId = typeof id === "string";
    const targetId = isStringId ? id : (selectedEndpoint ? selectedEndpoint._id : null);
    if (!targetId) return;

    if (isStringId) {
      if (!window.confirm("Are you sure you want to delete this endpoint?")) return;
    }

    try {
      setSaveStatus("Saving...");
      const res = await fetch(`${API_BASE}/${targetId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete endpoint");
      }

      // Fetch fresh list to sync perfectly with backend rebuild
      const resList = await fetch(API_BASE);
      const data = await resList.json();
      setEndpoints(data);

      if (selectedEndpoint && selectedEndpoint._id === targetId) {
        setSelectedEndpoint(data.length > 0 ? data[0] : null);
      }

      setShowDeleteConfirm(false);
      setSaveStatus("Saved");
    } catch (err) {
      console.error(err);
      alert("Error deleting endpoint: " + err.message);
      setSaveStatus("Error");
    }
  };

  // Helper for clipboard copies
  const triggerCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopyStatus(type);
    setTimeout(() => {
      setCopyStatus(null);
    }, 2000);
  };

  return (
    <div className="h-screen w-screen flex bg-surface-container-lowest overflow-hidden font-sans text-[#e1e2eb]">

      {/* Sidebar - Left */}
      <aside className="w-[320px] bg-surface-container-low flex flex-col h-full border-r border-outline-variant select-none">

        {/* Header Title */}
        <div className="p-md flex items-center justify-between border-b border-outline-variant bg-surface-container-low/40">
          <div className="flex items-center gap-sm">
            <div className="w-8 h-8 rounded overflow-hidden flex items-center justify-center bg-surface-container-highest border border-outline-variant">
              <img
                src="https://lh3.googleusercontent.com/aida/AP1WRLsepd38W5kmw8_suBvb9sih0dHgSdJbFB5ATHGK3sUN6VPkGQCLERCbGfdweZ5uqpeFuFpDP_CR-PaahRm4Tlto3tWZ90zHkVlC7WU3uQo5D8OnQqok7XsJI6ZUEnwZfk10ZI3RMBcfTVqcyqljqrf7a_53oBhoYB77uHptI2kuEY37Rxw3uEv5ICbczC4TL0E1RL1nmwqppJ1BK9HglZQWqFcseOSFRJIQ6sD62l-jd_UaNj-BdWig8u0"
                alt="Stub API Logo"
                className="w-7 h-7 object-contain"
              />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-on-surface font-sans">
              Stub API
            </h1>
          </div>
          <div className="flex items-center gap-xs">
            <div className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${saveStatus === "Saved" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
              }`}>
              {saveStatus}
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="px-md py-sm">
          <button
            onClick={() => setShowManualModal(true)}
            className="w-full bg-primary-container text-on-primary-container font-semibold py-sm px-md rounded-lg flex items-center justify-center gap-sm hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer text-sm shadow-md"
          >
            <span className="material-symbols-outlined text-[18px] font-bold" data-icon="add">add</span>
            New Endpoint
          </button>
        </div>

        {/* Endpoint navigation menu */}
        <nav className="flex-1 overflow-y-auto px-md py-sm space-y-xs">
          <p className="text-on-surface-variant text-[11px] font-bold px-sm py-xs mb-xs uppercase tracking-wider opacity-60 font-sans">
            Endpoints
          </p>
          {endpoints.length === 0 ? (
            <div className="text-[12px] text-on-surface-variant/40 px-sm py-md text-center bg-surface-dim/40 rounded-lg border border-dashed border-outline-variant/40">
              No endpoints. Use AI below to create one!
            </div>
          ) : (
            endpoints.map((ep) => {
              const isActive = selectedEndpoint && selectedEndpoint._id === ep._id;
              return (
                <div
                  key={ep._id}
                  className={`w-full flex items-center justify-between rounded-lg duration-100 group transition-all border ${isActive
                      ? "bg-secondary-container text-on-secondary-container border-secondary/20 shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container-highest border-transparent hover:text-on-surface"
                    }`}
                >
                  <button
                    onClick={() => {
                      setSelectedEndpoint(ep);
                      setActiveTab("response");
                    }}
                    className="flex-1 flex items-center gap-md px-md py-sm text-left truncate cursor-pointer"
                  >
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded leading-none shrink-0 ${getMethodBadgeClass(ep.method)}`}>
                      {formatMethod(ep.method)}
                    </span>
                    <span className="font-semibold text-sm truncate">{ep.name}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteEndpoint(ep._id);
                    }}
                    className="px-sm py-sm text-on-surface-variant opacity-40 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center cursor-pointer mr-xs hover:text-red-400"
                    title="Delete Endpoint"
                  >
                    <span className="material-symbols-outlined text-[16px]" data-icon="delete">delete</span>
                  </button>
                </div>
              );
            })
          )}
        </nav>

        {/* AI chat generation container */}
        <div className="p-md bg-surface-container-lowest border-t border-outline-variant">
          <div className="flex items-center gap-sm mb-sm text-on-surface">
            <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }} data-icon="auto_awesome">
              auto_awesome
            </span>
            <span className="text-xs font-bold font-sans uppercase tracking-wider text-primary">
              Generate with AI
            </span>
          </div>

          {/* AI Conversational Area */}
          {aiMessages.length > 0 ? (
            <div className="flex flex-col h-48 bg-surface-dim/60 rounded-lg border border-outline-variant p-xs overflow-hidden mb-sm text-[12px]">

              {/* Messages log */}
              <div className="flex-1 overflow-y-auto p-xs space-y-sm">
                {aiMessages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div className={`px-2 py-1.5 rounded-lg max-w-[85%] break-words ${msg.role === "user"
                        ? "bg-primary-container text-on-primary-container rounded-tr-none"
                        : "bg-surface-container-high text-on-surface rounded-tl-none border border-outline-variant/40"
                      }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isGenerating && (
                  <div className="flex justify-start items-center gap-xs text-on-surface-variant opacity-60">
                    <span className="material-symbols-outlined text-xs animate-spin" data-icon="progress_activity">progress_activity</span>
                    <span>AI is thinking...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat reply input */}
              <form onSubmit={(e) => handleAiSubmit(e, aiReplyText)} className="border-t border-outline-variant/40 p-xs flex gap-xs bg-surface-container-lowest/80">
                <input
                  type="text"
                  value={aiReplyText}
                  onChange={(e) => setAiReplyText(e.target.value)}
                  placeholder="Reply to AI..."
                  disabled={isGenerating}
                  className="flex-1 bg-surface-dim border border-outline-variant/60 rounded px-2 py-1 text-[12px] focus:border-primary focus:outline-none placeholder:opacity-30 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isGenerating || !aiReplyText.trim()}
                  className="bg-primary text-on-primary px-2 py-1 rounded hover:opacity-90 active:scale-95 transition-all text-[11px] font-semibold cursor-pointer disabled:opacity-40"
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={cancelAiSession}
                  className="px-1.5 py-1 border border-outline-variant rounded hover:bg-surface-container-highest active:scale-95 text-[11px] text-on-surface-variant"
                  title="Cancel Chat"
                >
                  Reset
                </button>
              </form>
            </div>
          ) : (
            /* Single textbox start state */
            <form onSubmit={handleAiSubmit}>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe your endpoint... (e.g. /users with id, name, and role)"
                disabled={isGenerating}
                className="w-full bg-surface-dim border border-outline-variant rounded-lg p-sm text-xs focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all resize-none h-20 mb-sm placeholder:text-on-surface-variant placeholder:opacity-40"
              />
              <div className="grid grid-cols-1 gap-base">
                <button
                  type="submit"
                  disabled={isGenerating || !aiPrompt.trim()}
                  className="bg-primary text-on-primary font-semibold py-sm rounded-lg flex items-center justify-center gap-sm hover:opacity-90 active:scale-[0.98] transition-all text-xs cursor-pointer disabled:opacity-40"
                >
                  {isGenerating ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin" data-icon="progress_activity">progress_activity</span>
                      Generating...
                    </>
                  ) : (
                    "Generate"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => triggerCopy(MOCK_BASE, "base")}
                  className="border border-outline-variant text-on-surface-variant py-sm rounded-lg flex items-center justify-center gap-sm hover:bg-surface-container-highest active:scale-[0.98] transition-all text-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]" data-icon="content_copy">
                    {copyStatus === "base" ? "check" : "content_copy"}
                  </span>
                  {copyStatus === "base" ? "Copied Base URL!" : "Copy Base URL"}
                </button>
              </div>
            </form>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative h-full bg-[#10131a]">
        {selectedEndpoint ? (
          <>
            {/* Top Navigation Bar */}
            <header className="h-16 flex items-center justify-between px-lg bg-surface border-b border-outline-variant shrink-0">
              <div className="flex items-center gap-md">
                <div className="flex items-center gap-sm">
                  <span className={`text-xs font-bold px-2 py-1 rounded border leading-none ${getMethodBadgeClass(selectedEndpoint.method)}`}>
                    {selectedEndpoint.method.toUpperCase()}
                  </span>
                  <h2 className="text-base text-on-surface font-semibold truncate tracking-wide">
                    {selectedEndpoint.name}
                  </h2>
                </div>
              </div>

              {/* Live URL Copy Box */}
              <div className="flex items-center gap-sm">
                <div className="flex items-center bg-surface-container-high rounded-full px-4 py-1.5 border border-outline-variant group">
                  <code className="text-on-surface-variant text-xs mr-md select-all font-mono">
                    {`${window.location.host}/mock${selectedEndpoint.name}`}
                  </code>
                  <button
                    onClick={() => triggerCopy(`${window.location.origin}/mock${selectedEndpoint.name}`, "mock")}
                    className="text-on-surface-variant hover:text-primary transition-colors flex items-center cursor-pointer"
                    title="Copy Full Mock Endpoint URL"
                  >
                    <span className="material-symbols-outlined text-[18px]" data-icon="content_copy">
                      {copyStatus === "mock" ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>
              </div>
            </header>

            {/* Response / Settings Tab Switcher */}
            <div className="flex items-center px-lg bg-surface border-b border-outline-variant h-12 shrink-0 select-none">
              <nav className="flex gap-lg h-full">
                <button
                  onClick={() => setActiveTab("response")}
                  className={`h-full flex items-center px-xs font-semibold text-sm transition-all border-b-2 cursor-pointer ${activeTab === "response"
                      ? "text-primary border-primary"
                      : "text-on-surface-variant border-transparent hover:text-on-surface hover:bg-surface-container-highest/20"
                    }`}
                >
                  Response
                </button>
                <button
                  onClick={() => setActiveTab("settings")}
                  className={`h-full flex items-center px-xs font-semibold text-sm transition-all border-b-2 cursor-pointer ${activeTab === "settings"
                      ? "text-primary border-primary"
                      : "text-on-surface-variant border-transparent hover:text-on-surface hover:bg-surface-container-highest/20"
                    }`}
                >
                  Settings
                </button>
              </nav>
            </div>

            {/* Content Canvas */}
            <div className="flex-1 overflow-auto bg-surface-container-lowest p-lg">
              <div className="max-w-4xl mx-auto space-y-lg relative pb-xl">

                {activeTab === "response" ? (
                  <>
                    {/* JSON Display Panel */}
                    <div className="rounded-xl border border-outline-variant bg-surface-dim overflow-hidden flex flex-col shadow-2xl">

                      {/* Faux Window Controls Header */}
                      <div className="px-md py-sm bg-surface-container-high flex items-center justify-between border-b border-outline-variant">
                        <span className="text-[11px] text-on-surface-variant uppercase tracking-widest opacity-60 font-semibold font-sans">
                          Preview Response (JSON)
                        </span>
                        <div className="flex gap-xs">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500/40"></span>
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/40"></span>
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500/40"></span>
                        </div>
                      </div>

                      {/* Code Area */}
                      <div className="max-h-[450px] overflow-y-auto bg-surface-dim p-lg leading-relaxed">
                        {selectedEndpoint.forceError ? (
                          <pre className="font-mono text-sm text-red-400">
                            {JSON.stringify(
                              {
                                error: "Forced error",
                                statusCode: selectedEndpoint.forceError,
                              },
                              null,
                              2
                            )}
                          </pre>
                        ) : selectedEndpoint.generatedData ? (
                          <pre
                            className="font-mono text-sm whitespace-pre-wrap md:whitespace-pre"
                            dangerouslySetInnerHTML={{ __html: highlightJson(selectedEndpoint.generatedData) }}
                          />
                        ) : (
                          <div className="text-on-surface-variant/40 italic text-sm">
                            No response data generated.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Latency and Error Control Box */}
                    <div className="flex flex-wrap items-center gap-md bg-surface-container p-md rounded-xl border border-outline-variant">

                      {/* Latency Section */}
                      <div className="flex items-center gap-md">
                        <div className="flex items-center gap-sm">
                          <span className="material-symbols-outlined text-on-surface-variant" data-icon="timer">timer</span>
                          <span className="text-xs text-on-surface-variant font-semibold font-sans">Latency</span>
                        </div>
                        {editingLatency ? (
                          <div className="flex items-center gap-xs">
                            <input
                              type="number"
                              min="0"
                              value={tempLatency}
                              autoFocus
                              onChange={(e) => setTempLatency(e.target.value)}
                              onBlur={saveLatency}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveLatency();
                                if (e.key === "Escape") setEditingLatency(false);
                              }}
                              className="bg-surface-dim border border-primary text-primary font-semibold text-xs px-2 py-1 rounded outline-none w-20 font-mono"
                            />
                            <span className="text-xs text-primary font-semibold font-mono">ms</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setTempLatency(selectedEndpoint.latencyMs.toString());
                              setEditingLatency(true);
                            }}
                            className="bg-surface-container-highest px-md py-1 rounded-lg border border-outline-variant flex items-center gap-xs cursor-pointer group hover:border-primary transition-all font-mono text-primary font-semibold text-xs"
                          >
                            <span>{selectedEndpoint.latencyMs}ms</span>
                            <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-100 transition-opacity" data-icon="edit">
                              edit
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Divider */}
                      <div className="hidden sm:block h-6 w-px bg-outline-variant"></div>

                      {/* Force Error Switch & Dropdown */}
                      <div className="flex items-center gap-md">
                        <div className="flex items-center gap-sm">
                          <span className="material-symbols-outlined text-on-surface-variant" data-icon="report">report</span>
                          <span className="text-xs text-on-surface-variant font-semibold font-sans">Force Error</span>
                        </div>

                        <label className="custom-toggle">
                          <input
                            type="checkbox"
                            checked={selectedEndpoint.forceError !== null && selectedEndpoint.forceError !== undefined}
                            onChange={(e) => toggleForceError(e.target.checked)}
                          />
                          <span className="slider"></span>
                        </label>

                        {selectedEndpoint.forceError && (
                          <select
                            value={selectedEndpoint.forceError}
                            onChange={(e) => updateControls({ forceError: parseInt(e.target.value, 10) })}
                            className="bg-surface-dim border border-outline-variant rounded-lg px-2 py-1 text-xs text-red-300 focus:ring-1 focus:ring-red-400 focus:border-red-400 outline-none font-mono font-semibold"
                          >
                            <option value={400}>400 Bad Request</option>
                            <option value={401}>401 Unauthorized</option>
                            <option value={403}>403 Forbidden</option>
                            <option value={404}>404 Not Found</option>
                            <option value={500}>500 Internal Server</option>
                            <option value={502}>502 Bad Gateway</option>
                            <option value={503}>503 Service Unavailable</option>
                          </select>
                        )}
                      </div>

                      <div className="flex-1"></div>

                      {/* Meta Info */}
                      <div className="text-on-surface-variant text-[11px] opacity-40 font-sans font-semibold">
                        Registered with {selectedEndpoint.fields?.length || 0} fields
                      </div>
                    </div>
                  </>
                ) : (
                  /* Settings Tab Content */
                  <div className="bg-surface-container border border-outline-variant rounded-xl p-lg shadow-2xl space-y-md">
                    <h3 className="text-base font-bold text-on-surface flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[20px]" data-icon="settings">settings</span>
                      Endpoint Settings
                    </h3>

                    {/* Metadata summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md p-md bg-surface-dim/40 rounded-lg border border-outline-variant/60 text-xs">
                      <div className="space-y-sm">
                        <div>
                          <span className="text-on-surface-variant opacity-60 block font-sans">Method</span>
                          <span className="font-semibold text-sm text-primary uppercase">{selectedEndpoint.method}</span>
                        </div>
                        <div>
                          <span className="text-on-surface-variant opacity-60 block font-sans">Endpoint Path</span>
                          <span className="font-semibold text-sm text-on-surface">{selectedEndpoint.name}</span>
                        </div>
                      </div>
                      <div className="space-y-sm">
                        <div>
                          <span className="text-on-surface-variant opacity-60 block font-sans">Mock URL Target</span>
                          <a
                            href={`${window.location.origin}/mock${selectedEndpoint.name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-sm text-primary-container hover:underline truncate block"
                          >
                            {`${window.location.origin}/mock${selectedEndpoint.name}`}
                          </a>
                        </div>
                        <div>
                          <span className="text-on-surface-variant opacity-60 block font-sans">Schema Fields count</span>
                          <span className="font-semibold text-sm text-on-surface">{selectedEndpoint.fields?.length || 0} fields</span>
                        </div>
                      </div>
                    </div>

                    {/* Fields List */}
                    <div className="space-y-sm">
                      <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider font-sans">
                        Fields Schema
                      </h4>
                      <div className="flex flex-wrap gap-sm">
                        {selectedEndpoint.fields?.map((field, idx) => (
                          <span
                            key={idx}
                            className="bg-surface-container-highest px-3 py-1.5 rounded-lg border border-outline-variant text-xs text-on-surface font-semibold flex items-center gap-xs"
                          >
                            <span className="material-symbols-outlined text-sm text-on-surface-variant opacity-50" data-icon="tag">tag</span>
                            {field.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Route behaviors summary */}
                    <div className="text-xs bg-surface-dim/30 border border-outline-variant p-sm rounded-lg space-y-xs leading-relaxed text-on-surface-variant/80">
                      <p className="font-bold text-on-surface mb-1 font-sans">Simulation Behaviors:</p>
                      <ul className="list-disc pl-md space-y-1">
                        <li><span className="text-primary font-bold">GET</span> calls serve the list of AI-generated realistic records.</li>
                        <li><span className="text-primary font-bold">POST</span> calls echo back the payload request data with a random string <code className="bg-surface-container px-1 rounded text-red-300 text-[10px]">id</code>.</li>
                        <li><span className="text-primary font-bold">PUT/PATCH</span> calls echo back the edited payload values.</li>
                        <li><span className="text-primary font-bold">DELETE</span> calls return a success verification payload immediately.</li>
                      </ul>
                    </div>

                    {/* Danger zone / deletion */}
                    <div className="pt-md border-t border-outline-variant/60 space-y-sm">
                      <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider font-sans">Danger Zone</h4>
                      {showDeleteConfirm ? (
                        <div className="bg-red-950/20 border border-red-900/40 rounded-lg p-md space-y-md flex flex-col md:flex-row items-center justify-between gap-md">
                          <p className="text-xs text-red-300 font-sans font-semibold">
                            Delete this endpoint permanently? This action cannot be undone.
                          </p>
                          <div className="flex gap-sm">
                            <button
                              onClick={deleteEndpoint}
                              className="bg-red-600 text-white font-semibold px-4 py-1.5 rounded-lg text-xs hover:bg-red-700 cursor-pointer active:scale-95 transition-all shadow-md"
                            >
                              Yes, Delete
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(false)}
                              className="border border-outline-variant text-on-surface font-semibold px-4 py-1.5 rounded-lg text-xs hover:bg-surface-container-highest cursor-pointer active:scale-95 transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-xs cursor-pointer active:scale-[0.98] transition-all shadow-sm"
                        >
                          <span className="material-symbols-outlined text-[16px]" data-icon="delete">delete</span>
                          Delete Endpoint
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Background watermark */}
                <div className="absolute bottom-0 right-0 p-lg opacity-5 pointer-events-none select-none">
                  <span className="material-symbols-outlined text-[160px]" data-icon="api">api</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Empty State Dashboard */
          <div className="flex-1 flex flex-col items-center justify-center p-xl text-center max-w-[512px] mx-auto space-y-md select-none bg-[#10131a]">
            <span className="material-symbols-outlined text-[80px] text-primary opacity-30 animate-pulse" data-icon="api">api</span>
            <h2 className="text-lg font-bold text-on-surface font-sans">No Mock Endpoints Found</h2>
            <p className="text-xs text-on-surface-variant opacity-60 leading-relaxed font-sans">
              Get started by typing an endpoint description in the AI panel on the left (e.g. "/customers with email and subscriptionLevel") or create a manual schema by clicking the button below.
            </p>
            <button
              onClick={() => setShowManualModal(true)}
              className="bg-primary-container text-on-primary-container font-semibold py-sm px-lg rounded-lg flex items-center justify-center gap-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer text-xs shadow-md"
            >
              <span className="material-symbols-outlined text-[18px]" data-icon="add">add</span>
              Create Endpoint Manually
            </button>
          </div>
        )}
      </main>

      {/* MODAL 1: AI CONFIRM ENDPOINT SCHEMA */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-md select-none">
          <div className="bg-surface-container border border-outline-variant rounded-xl shadow-2xl max-w-[448px] w-full flex flex-col max-h-[90vh] overflow-hidden">

            <header className="px-lg py-md border-b border-outline-variant bg-surface-container-high flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }} data-icon="auto_awesome">
                auto_awesome
              </span>
              <h3 className="text-sm font-bold text-on-surface font-sans">
                Review AI Schema Draft
              </h3>
            </header>

            <div className="p-lg overflow-y-auto space-y-md flex-1 text-xs">
              {/* Method & Path Fields */}
              <div className="grid grid-cols-3 gap-sm">
                <div className="col-span-1">
                  <label className="block text-on-surface-variant font-sans font-semibold mb-1">Method</label>
                  <select
                    value={pendingEndpoint.method}
                    onChange={(e) => setPendingEndpoint({ ...pendingEndpoint, method: e.target.value })}
                    className="w-full bg-surface-dim border border-outline-variant rounded-lg p-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-mono font-semibold"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-on-surface-variant font-sans font-semibold mb-1">Path</label>
                  <input
                    type="text"
                    value={pendingEndpoint.name}
                    onChange={(e) => setPendingEndpoint({ ...pendingEndpoint, name: e.target.value })}
                    placeholder="/my-endpoint"
                    className="w-full bg-surface-dim border border-outline-variant rounded-lg p-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-mono font-semibold"
                  />
                </div>
              </div>

              {/* Dynamic Fields List */}
              <div className="space-y-sm">
                <div className="flex items-center justify-between">
                  <label className="text-on-surface-variant font-sans font-semibold">Generated Schema Fields</label>
                  <button
                    onClick={addConfirmField}
                    className="text-primary hover:underline text-[11px] font-semibold flex items-center gap-xs cursor-pointer font-sans"
                  >
                    <span className="material-symbols-outlined text-[14px]" data-icon="add">add</span>
                    Add Field
                  </button>
                </div>

                <div className="space-y-xs max-h-48 overflow-y-auto pr-xs">
                  {pendingEndpoint.fields.map((field, idx) => (
                    <div key={idx} className="flex items-center gap-xs">
                      <span className="text-on-surface-variant/40 text-[10px] font-mono w-4 text-right">#{idx + 1}</span>
                      <input
                        type="text"
                        value={field.name}
                        onChange={(e) => updateConfirmField(idx, e.target.value)}
                        placeholder="field_name"
                        className="flex-1 bg-surface-dim border border-outline-variant rounded p-1 text-[11px] focus:outline-none focus:border-primary font-mono"
                      />
                      <button
                        onClick={() => removeConfirmField(idx)}
                        className="text-on-surface-variant hover:text-red-400 p-1 flex items-center justify-center cursor-pointer"
                        title="Delete Field"
                      >
                        <span className="material-symbols-outlined text-[16px]" data-icon="delete">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <footer className="px-lg py-md border-t border-outline-variant bg-surface-container-high flex justify-end gap-sm">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-md py-sm border border-outline-variant rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container-highest cursor-pointer active:scale-95 transition-all font-sans"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCreate}
                className="px-md py-sm bg-primary text-on-primary rounded-lg text-xs font-bold hover:opacity-90 cursor-pointer active:scale-95 transition-all font-sans shadow-md"
              >
                Confirm & Create
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL 2: MANUAL ENDPOINT CREATION */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-md select-none">
          <div className="bg-surface-container border border-outline-variant rounded-xl shadow-2xl max-w-[448px] w-full flex flex-col max-h-[95vh] overflow-hidden">

            <header className="px-lg py-md border-b border-outline-variant bg-surface-container-high flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary text-[20px]" data-icon="add_circle">
                add_circle
              </span>
              <h3 className="text-sm font-bold text-on-surface font-sans">
                Create New Endpoint
              </h3>
            </header>

            <div className="p-lg overflow-y-auto space-y-md flex-1 text-xs">
              {/* Method & Path */}
              <div className="grid grid-cols-3 gap-sm">
                <div className="col-span-1">
                  <label className="block text-on-surface-variant font-sans font-semibold mb-1">Method</label>
                  <select
                    value={manualMethod}
                    onChange={(e) => setManualMethod(e.target.value)}
                    className="w-full bg-surface-dim border border-outline-variant rounded-lg p-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-mono font-semibold"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-on-surface-variant font-sans font-semibold mb-1">Endpoint Path</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="e.g. /products"
                    className="w-full bg-surface-dim border border-outline-variant rounded-lg p-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all font-mono font-semibold"
                  />
                </div>
              </div>

              {/* Schema fields */}
              <div className="space-y-sm">
                <div className="flex items-center justify-between">
                  <label className="text-on-surface-variant font-sans font-semibold">Schema Fields</label>
                  <button
                    onClick={addManualField}
                    className="text-primary hover:underline text-[11px] font-semibold flex items-center gap-xs cursor-pointer font-sans"
                  >
                    <span className="material-symbols-outlined text-[14px]" data-icon="add">add</span>
                    Add Field
                  </button>
                </div>

                <div className="space-y-xs max-h-48 overflow-y-auto pr-xs">
                  {manualFields.map((field, idx) => (
                    <div key={idx} className="flex items-center gap-xs">
                      <span className="text-on-surface-variant/40 text-[10px] font-mono w-4 text-right">#{idx + 1}</span>
                      <input
                        type="text"
                        value={field}
                        onChange={(e) => updateManualField(idx, e.target.value)}
                        placeholder="e.g. price"
                        className="flex-1 bg-surface-dim border border-outline-variant rounded p-1 text-[11px] focus:outline-none focus:border-primary font-mono"
                      />
                      <button
                        onClick={() => removeManualField(idx)}
                        className="text-on-surface-variant hover:text-red-400 p-1 flex items-center justify-center cursor-pointer"
                        title="Delete Field"
                      >
                        <span className="material-symbols-outlined text-[16px]" data-icon="delete">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <footer className="px-lg py-md border-t border-outline-variant bg-surface-container-high flex justify-end gap-sm">
              <button
                onClick={() => setShowManualModal(false)}
                className="px-md py-sm border border-outline-variant rounded-lg text-xs font-semibold text-on-surface hover:bg-surface-container-highest cursor-pointer active:scale-95 transition-all font-sans"
              >
                Cancel
              </button>
              <button
                onClick={handleManualCreate}
                className="px-md py-sm bg-primary text-on-primary rounded-lg text-xs font-bold hover:opacity-90 cursor-pointer active:scale-95 transition-all font-sans shadow-md"
              >
                Create
              </button>
            </footer>
          </div>
        </div>
      )}

    </div>
  );
}
