import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";

interface AgentTerminalProps {
  backlogPath?: string;
  onStatusChange?: (status: string | null) => void;
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
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gi, "");
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
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function shouldIgnoreChatLine(line: string) {
  return /^(OpenAI Codex|model:|cwd:|approval:|sandbox:|session id:|--------|\[[^\]]+\]|thinking|working|planning)$/i.test(
    line,
  );
}

function shouldShowTerminal(line: string) {
  return /(login|authenticate|approval|approve|allow access|permission denied|access denied|error:|failed:|exception|press enter|open a browser)/i.test(
    line,
  );
}

export default function AgentTerminal({ backlogPath, onStatusChange }: AgentTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const suppressOutputRef = useRef(true);
  const lineBufferRef = useRef("");
  const assistantBufferRef = useRef("");
  const assistantFlushTimerRef = useRef<number | null>(null);
  const pendingUserEchoesRef = useRef<string[]>([]);
  const outboundQueueRef = useRef<string[]>([]);
  const [activeTab, setActiveTab] = useState<AgentTab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isAgentTyping, setIsAgentTyping] = useState(false);

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
    }, 1100);
  }

  function switchToTerminal(status: string) {
    flushAssistantBuffer();
    setActiveTab("terminal");
    onStatusChange?.(status);
  }

  function consumeChatLine(rawLine: string) {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    const pendingEcho = pendingUserEchoesRef.current[0];
    if (pendingEcho && line === pendingEcho) {
      pendingUserEchoesRef.current.shift();
      return;
    }

    if (shouldIgnoreChatLine(line)) {
      return;
    }

    if (shouldShowTerminal(line)) {
      switchToTerminal("Switched to terminal view for auth or error handling.");
      return;
    }

    assistantBufferRef.current = assistantBufferRef.current
      ? `${assistantBufferRef.current}\n${line}`
      : line;
    setIsAgentTyping(true);
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
    setDraft("");
    setMessages([]);
    setIsAgentTyping(false);
    setActiveTab("chat");
  }

  function sendInput(data: string) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      outboundQueueRef.current.push(data);
      onStatusChange?.("Waiting for Codex session…");
      return;
    }
    socket.send(JSON.stringify({ type: "input", data }));
  }

  function flushOutboundQueue() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || outboundQueueRef.current.length === 0) {
      return;
    }
    for (const data of outboundQueueRef.current) {
      socket.send(JSON.stringify({ type: "input", data }));
    }
    outboundQueueRef.current = [];
  }

  function sendChatMessage() {
    const message = draft.trim();
    if (!message) return;

    flushAssistantBuffer();
    appendMessage("user", message);
    pendingUserEchoesRef.current.push(message);
    sendInput(`${message}`);
    setDraft("");
  }


  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, activeTab, isAgentTyping]);

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

    const socket = new WebSocket(websocketUrl());
    socketRef.current = socket;

    const sendResize = () => {
      fitAddon.fit();
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        }),
      );
      scrollTerminalToBottom(terminal);
    };

    socket.addEventListener("open", () => {
      onStatusChange?.("Codex terminal connected.");
      sendResize();
      flushOutboundQueue();
    });

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(String(event.data)) as
        | { type: "output"; sessionId: string; data: string }
        | { type: "session"; sessionId: string; backlogPath: string }
        | { type: "exit"; sessionId: string; exitCode: number; signal?: number };

      if (payload.type === "output") {
        if (suppressOutputRef.current) {
          return;
        }
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
        suppressOutputRef.current = false;
        sessionIdRef.current = payload.sessionId;
        flushOutboundQueue();
        scrollTerminalToBottom(terminal);
        onStatusChange?.(`Codex session attached to ${payload.backlogPath}.`);
        return;
      }

      flushAssistantBuffer();
      terminal.writeln(`\r\n[Codex exited with code ${payload.exitCode}]`);
      if (payload.exitCode !== 0) {
        switchToTerminal(`Codex exited with code ${payload.exitCode}.`);
      } else {
        onStatusChange?.("Codex session exited.");
      }
      scrollTerminalToBottom(terminal);
    });

    socket.addEventListener("close", () => {
      onStatusChange?.("Codex terminal disconnected.");
    });

    const inputDisposable = terminal.onData((data) => {
      const submittedLine = data.includes("\r");

      if (suppressOutputRef.current && submittedLine) {
        suppressOutputRef.current = false;
        terminal.reset();
        scrollTerminalToBottom(terminal);
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
      clearAssistantFlushTimer();
      flushAssistantBuffer();
      inputDisposable.dispose();
      resizeObserver.disconnect();
      socket.close();
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
    if (!backlogPath) return;

    let cancelled = false;

    void (async () => {
      try {
        onStatusChange?.("Starting Codex for this backlog…");
        const response = await fetch("/api/agent/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restart: true }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { sessionId?: string; backlogPath?: string; message?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "Failed to start Codex terminal.");
        }

        if (cancelled) return;
        suppressOutputRef.current = true;
        terminalRef.current?.reset();
        sessionIdRef.current = payload?.sessionId ?? null;
        resetChatState();
        if (terminalRef.current) {
          scrollTerminalToBottom(terminalRef.current);
        }
        onStatusChange?.(`Codex started for ${payload?.backlogPath ?? backlogPath}.`);
      } catch (error) {
        if (cancelled) return;
        switchToTerminal((error as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backlogPath, onStatusChange]);

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
            <button type="button" className="primary-button" onClick={sendChatMessage}>
              Send
            </button>
          </div>
        </section>

        <section className={`agent-terminal-panel ${activeTab === "terminal" ? "is-active" : ""}`}>
          <div ref={hostRef} className="terminal-shell" aria-label="Codex terminal" />
        </section>
      </div>
    </div>
  );
}
