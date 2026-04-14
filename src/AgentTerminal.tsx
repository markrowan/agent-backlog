import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";

interface AgentTerminalProps {
  agentCommand?: string;
  backlogPath?: string;
  configVersion?: number;
  filterContext?: string;
  intakeContext?: string;
  onStatusChange?: (status: string | null) => void;
  onSessionPathChange?: (path: string | null) => void;
  onIntakeContextConsumed?: () => void;
}

type AgentTab = "chat" | "terminal";
type ChatRole = "user" | "agent";

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

function websocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const port = window.location.port === "5173" ? "4177" : window.location.port;
  return `${protocol}://${window.location.hostname}${port ? `:${port}` : ""}/api/agent/terminal`;
}

function stripAnsi(value: string) {
  return value
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gi, "");
}

function scrollTerminalToBottom(terminal: Terminal) {
  terminal.scrollToBottom();
  requestAnimationFrame(() => {
    const viewport = terminal.element?.querySelector(".xterm-viewport") as HTMLDivElement | null;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  });
}

function normalizeChatText(value: string) {
  return stripAnsi(value)
    .replace(/[\u0000\u0007]/g, "")
    .replace(/[␛␇]/g, "")
    .replace(/[▎▏]/g, "\n")
    .replace(/\n---+\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function sanitizeAssistantLine(value: string) {
  return value
    .replace(/[─-╿]/g, " ")
    .replace(/[•▪◦·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeUserChatMessage(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => {
      const normalized = line.trim().replace(/^>\s*/, "").trim().toLowerCase();
      return normalized !== "implement {feature}";
    })
    .join("\n")
    .trim();
}

function stripPromptArtifacts(value: string) {
  return value
    .replace(/[\u0000\u0007]/g, "")
    .replace(/[␛␇]/g, "")
    .replace(/[▎▏].*$/u, "")
    .replace(/\s*---+\s*$/u, "")
    .replace(/(?:^|\s)›.*$/u, "")
    .replace(/\s*Context\s*update:.*$/i, "")
    .replace(/\s*Contextupdate:.*$/i, "")
    .replace(/\s+[⠁-⣿▏▎▍▌▋▊▉█].*$/u, "")
    .replace(/\s+gpt-[\w.-]+\s+(?:low|medium|high|xhigh)(?:\s+·)?\s+Context\s+\[[^\]]*\].*$/i, "")
    .replace(/\s+(?:approval|sandbox|cwd|model):.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPaulaMessage(line: string) {
  const match = line.match(/^PAULA>>\s*(.*)$/i);
  if (!match) return null;
  const message = stripPromptArtifacts(match[1] ?? "");
  if (/^(user request:|submitted message:|request:)/i.test(message)) {
    return null;
  }
  return message || null;
}

function shouldShowTerminal(line: string) {
  return /(request(?:ing)? permission|request(?:ing)? approval|grant access|allow access|permission required|auth(?:entication)? required|login required|continue\?\s*\[[^\]]+\]|confirm\?\s*\[[^\]]+\]|\[[yYnN]\/[yYnN]\]|press enter(?: to continue)?|open a browser(?: to authenticate)?)/i.test(
    line,
  );
}

export default function AgentTerminal({ agentCommand, backlogPath, configVersion, filterContext, intakeContext, onStatusChange, onSessionPathChange, onIntakeContextConsumed }: AgentTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lineBufferRef = useRef("");
  const assistantBufferRef = useRef("");
  const assistantFlushTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const isUnmountingRef = useRef(false);
  const authSwitchRef = useRef(false);
  const lastFilterContextRef = useRef<string | null>(null);
  const pendingFilterContextRef = useRef<string | null>(null);
  const pendingIntakeContextRef = useRef<string | null>(null);
  const pendingUserEchoesRef = useRef<string[]>([]);
  const outboundQueueRef = useRef<string[]>([]);
  const [activeTab, setActiveTab] = useState<AgentTab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [undoHint, setUndoHint] = useState("No reversible Paula backlog edit exists yet.");
  const [undoBusy, setUndoBusy] = useState(false);

  function appendMessage(role: ChatRole, text: string) {
    const normalized = text.trim();
    if (!normalized) return;
    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        text: normalized,
      },
    ]);
  }

  function clearAssistantFlushTimer() {
    if (assistantFlushTimerRef.current !== null) {
      window.clearTimeout(assistantFlushTimerRef.current);
      assistantFlushTimerRef.current = null;
    }
  }

  function flushAssistantBuffer() {
    clearAssistantFlushTimer();
    const next = assistantBufferRef.current.trim();
    assistantBufferRef.current = "";
    setIsAgentTyping(false);
    if (!next) return;
    appendMessage("agent", next);
  }

  function scheduleAssistantFlush() {
    clearAssistantFlushTimer();
    assistantFlushTimerRef.current = window.setTimeout(() => {
      flushAssistantBuffer();
    }, 2200);
  }

  function switchToTerminal(status: string) {
    flushAssistantBuffer();
    authSwitchRef.current = true;
    setActiveTab("terminal");
    onStatusChange?.(status);
  }

  function consumeChatLine(rawLine: string) {
    const raw = normalizeChatText(rawLine).trim();
    if (!raw) {
      return;
    }

    const line = sanitizeAssistantLine(raw);
    const pendingEcho = pendingUserEchoesRef.current[0];
    if (pendingEcho && line === pendingEcho) {
      pendingUserEchoesRef.current.shift();
      return;
    }

    if (shouldShowTerminal(line)) {
      switchToTerminal("Switched to terminal view for auth or error handling.");
      return;
    }

    if (!/^PAULA>>\s*/i.test(raw)) {
      return;
    }

    const paulaMessage = extractPaulaMessage(raw);
    if (!paulaMessage) {
      return;
    }

    if (authSwitchRef.current) {
      authSwitchRef.current = false;
      setActiveTab("chat");
    }
    setIsAgentTyping(true);

    assistantBufferRef.current = assistantBufferRef.current
      ? `${assistantBufferRef.current}\n${paulaMessage}`
      : paulaMessage;
    scheduleAssistantFlush();
  }

  function processOutputForChat(data: string) {
    const normalized = normalizeChatText(data);
    lineBufferRef.current += normalized;
    const lines = lineBufferRef.current.split("\n");
    lineBufferRef.current = lines.pop() ?? "";
    for (const line of lines) {
      consumeChatLine(line);
    }
  }

  function resetChatState() {
    clearAssistantFlushTimer();
    lineBufferRef.current = "";
    assistantBufferRef.current = "";
    pendingUserEchoesRef.current = [];
    outboundQueueRef.current = [];
    pendingFilterContextRef.current = null;
    setDraft("");
    setMessages([]);
    setIsAgentTyping(false);
    setCanUndo(false);
    setUndoHint("No reversible Paula backlog edit exists yet.");
    setUndoBusy(false);
    setActiveTab("chat");
  }

  function sendInput(data: string) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      outboundQueueRef.current.push(JSON.stringify({ type: "input", data }));
      onStatusChange?.("Waiting for agent session…");
      return;
    }
    socket.send(JSON.stringify({ type: "input", data }));
  }

  function submitInput(data: string) {
    const socket = socketRef.current;
    const payload = JSON.stringify({ type: "submit", data });
    setIsAgentTyping(true);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      outboundQueueRef.current.push(payload);
      onStatusChange?.("Waiting for agent session…");
      return;
    }
    socket.send(payload);
  }

  function flushOutboundQueue() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || outboundQueueRef.current.length === 0) {
      return;
    }
    for (const payload of outboundQueueRef.current) {
      socket.send(payload);
    }
    outboundQueueRef.current = [];
  }

  async function restoreUndo() {
    if (!backlogPath || undoBusy) return;
    setUndoBusy(true);
    try {
      const response = await fetch("/api/backlog/undo", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        const message = payload?.message ?? "Undo failed.";
        onStatusChange?.(message);
        appendMessage("agent", message);
        return;
      }
      const message = "Undo restored the previous backlog version for this file.";
      setCanUndo(false);
      setUndoHint("No reversible Paula backlog edit exists yet.");
      onStatusChange?.(message);
      appendMessage("agent", message);
    } catch {
      const message = "Undo failed.";
      onStatusChange?.(message);
      appendMessage("agent", message);
    } finally {
      setUndoBusy(false);
    }
  }

  function sendChatMessage() {
    const message = sanitizeUserChatMessage(draft);
    if (!message) {
      setDraft("");
      return;
    }

    const deferredContext = pendingFilterContextRef.current?.trim();
    const intakeContextText = pendingIntakeContextRef.current?.trim();
    const submittedMessage = [intakeContextText, deferredContext, `User request: ${message}`].filter(Boolean).join("\n\n") || message;

    flushAssistantBuffer();
    appendMessage("user", message);
    pendingUserEchoesRef.current.push(message);
    pendingUserEchoesRef.current.push(`User request: ${message}`);
    pendingUserEchoesRef.current.push(submittedMessage);
    if (intakeContextText) {
      pendingUserEchoesRef.current.push(intakeContextText);
      pendingUserEchoesRef.current.push(`${intakeContextText}\n\nUser request: ${message}`);
    }
    if (deferredContext) {
      pendingUserEchoesRef.current.push(deferredContext);
      pendingUserEchoesRef.current.push(`${deferredContext}\n\nUser request: ${message}`);
    }
    submitInput(submittedMessage);
    pendingFilterContextRef.current = null;
    pendingIntakeContextRef.current = null;
    if (intakeContextText) {
      onStatusChange?.("Inbox intake sent with hidden new-story context.");
      onIntakeContextConsumed?.();
    }
    setDraft("");
  }

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, activeTab, isAgentTyping]);

  useEffect(() => {
    if (!backlogPath) {
      lastFilterContextRef.current = null;
      pendingFilterContextRef.current = null;
      setCanUndo(false);
      setUndoHint("Open a backlog file before using Undo.");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/backlog/undo/status");
        const payload = (await response.json().catch(() => null)) as { available?: boolean; message?: string } | null;
        if (cancelled) return;
        if (!response.ok) {
          setCanUndo(false);
          setUndoHint(payload?.message ?? "Undo status unavailable.");
          return;
        }
        setCanUndo(Boolean(payload?.available));
        setUndoHint(payload?.message ?? "Undo uses the saved pre-Paula backup for this backlog only.");
      } catch {
        if (!cancelled) {
          setCanUndo(false);
          setUndoHint("Undo status unavailable.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backlogPath, configVersion]);

  useEffect(() => {
    if (lastFilterContextRef.current === null) {
      lastFilterContextRef.current = filterContext ?? null;
      return;
    }

    const nextContext = filterContext ?? null;
    if (nextContext !== lastFilterContextRef.current) {
      lastFilterContextRef.current = nextContext;
      pendingFilterContextRef.current = nextContext;
    }
  }, [backlogPath, filterContext]);

  useEffect(() => {
    pendingIntakeContextRef.current = intakeContext?.trim() || null;
  }, [intakeContext]);

  useEffect(() => {
    if (!hostRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 2000,
      theme: {
        background: "rgba(250, 252, 255, 0.64)",
        foreground: "#0f172a",
        cursor: "#1d4ed8",
        selectionBackground: "rgba(37, 99, 235, 0.18)",
      },
    });
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    fitAddon.fit();
    terminalRef.current = terminal;

    const sendResize = () => {
      const currentSocket = socketRef.current;
      fitAddon.fit();
      if (!currentSocket || currentSocket.readyState !== WebSocket.OPEN) return;
      currentSocket.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        }),
      );
      scrollTerminalToBottom(terminal);
    };

    const connectSocket = () => {
      const socket = new WebSocket(websocketUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        onStatusChange?.("Agent terminal connected.");
        sendResize();
      });

      socket.addEventListener("message", (event) => {
        const payload = JSON.parse(String(event.data)) as
          | { type: "output"; sessionId: string; data: string }
          | { type: "session"; sessionId: string; backlogPath: string; agentCommand?: string }
          | { type: "exit"; sessionId: string; exitCode: number; signal?: number };

        if (payload.type === "output") {
          terminal.write(payload.data, () => {
            scrollTerminalToBottom(terminal);
          });
          processOutputForChat(payload.data);
          return;
        }

        if (payload.type === "session") {
          if (payload.sessionId !== sessionIdRef.current) {
            terminal.reset();
          }
          sessionIdRef.current = payload.sessionId;
          flushOutboundQueue();
          scrollTerminalToBottom(terminal);
          onSessionPathChange?.(payload.backlogPath);
          onStatusChange?.(`Agent session attached to ${payload.backlogPath}.`);
          return;
        }

        flushAssistantBuffer();
        terminal.writeln(`\r\n[Agent exited with code ${payload.exitCode}]`);
        if (payload.exitCode !== 0) {
          switchToTerminal(`Agent exited with code ${payload.exitCode}.`);
        } else {
          onStatusChange?.("Agent session exited.");
        }
        scrollTerminalToBottom(terminal);
      });

      socket.addEventListener("close", () => {
        if (isUnmountingRef.current) {
          return;
        }
        onStatusChange?.("Reconnecting to agent session...");
        onSessionPathChange?.(null);
        reconnectTimerRef.current = window.setTimeout(() => {
          connectSocket();
        }, 350);
      });
    };

    connectSocket();

    const inputDisposable = terminal.onData((data) => {
      const submittedLine = data.includes("\r");

      if (submittedLine && activeTab === "terminal") {
        setIsAgentTyping(true);
        onStatusChange?.("Waiting for Paula...");
      }

      sendInput(data);

      if (submittedLine) {
        requestAnimationFrame(() => {
          scrollTerminalToBottom(terminal);
        });
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      sendResize();
    });
    resizeObserver.observe(hostRef.current);

    return () => {
      isUnmountingRef.current = true;
      clearAssistantFlushTimer();
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      flushAssistantBuffer();
      inputDisposable.dispose();
      resizeObserver.disconnect();
      socketRef.current?.close();
      socketRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onStatusChange]);

  useEffect(() => {
    if (activeTab !== "terminal") return;
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
      if (terminalRef.current) {
        scrollTerminalToBottom(terminalRef.current);
      }
    });
  }, [activeTab]);

  useEffect(() => {
    if (!backlogPath) {
      onSessionPathChange?.(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        onStatusChange?.("Starting agent for this backlog…");

        const selectResponse = await fetch("/api/backlog/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: backlogPath }),
        });
        const selectPayload = (await selectResponse.json().catch(() => null)) as { message?: string } | null;

        if (!selectResponse.ok) {
          throw new Error(selectPayload?.message ?? "Failed to reselect backlog before starting agent.");
        }

        const response = await fetch("/api/agent/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restart: false }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { sessionId?: string; backlogPath?: string; message?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "Failed to start agent terminal.");
        }

        if (cancelled) return;
        terminalRef.current?.reset();
        sessionIdRef.current = payload?.sessionId ?? null;
        resetChatState();
        if (terminalRef.current) {
          scrollTerminalToBottom(terminalRef.current);
        }
        onSessionPathChange?.(payload?.backlogPath ?? backlogPath ?? null);
        onStatusChange?.(`Agent started for ${payload?.backlogPath ?? backlogPath}.`);
      } catch (error) {
        if (cancelled) return;
        switchToTerminal((error as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentCommand, backlogPath, configVersion, onSessionPathChange, onStatusChange]);

  return (
    <div className="agent-surface">
      <div className="agent-tabs" role="tablist" aria-label="Paula views">
        <button
          type="button"
          className={`agent-tab ${activeTab === "chat" ? "is-active" : ""}`}
          role="tab"
          aria-selected={activeTab === "chat"}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          className={`agent-tab ${activeTab === "terminal" ? "is-active" : ""}`}
          role="tab"
          aria-selected={activeTab === "terminal"}
          onClick={() => setActiveTab("terminal")}
        >
          Terminal
        </button>
      </div>

      <div className="agent-panel-body">
        <section className={`agent-chat-panel ${activeTab === "chat" ? "is-active" : ""}`}>
          <div ref={chatScrollRef} className="agent-chat-scroll">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`agent-message agent-message--${message.role}`}
              >
                <p>{message.text}</p>
              </article>
            ))}
            {isAgentTyping ? (
              <article className="agent-message agent-message--agent agent-message--typing" aria-live="polite">
                <span className="agent-typing-dot" />
                <span className="agent-typing-dot" />
                <span className="agent-typing-dot" />
              </article>
            ) : null}
          </div>

          <div className="agent-chat-compose">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Tell Paula what to do with the backlog"
              rows={2}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendChatMessage();
                }
              }}
            />
            <div className="agent-chat-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={restoreUndo}
                disabled={!canUndo || undoBusy}
                title={undoHint}
                aria-label={undoHint}
              >
                {undoBusy ? "Undoing…" : "Undo"}
              </button>
              <button type="button" className="primary-button" onClick={sendChatMessage}>
                Send
              </button>
            </div>
          </div>
        </section>

        <section className={`agent-terminal-panel ${activeTab === "terminal" ? "is-active" : ""}`}>
          <div ref={hostRef} className="terminal-shell" aria-label="Agent terminal" />
        </section>
      </div>
    </div>
  );
}
