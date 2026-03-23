import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are conducting a sharp, personalized AI Business Audit. Your job is to understand this specific business deeply enough to identify their single highest-leverage AI opportunity — the first skill or agent that would create a real, measurable difference in revenue or time.

RULES:
- Ask focused questions ONE AT A TIME. Wait for each answer before asking the next.
- 4-5 questions maximum. You're listening for: what's manual and repetitive, what requires the owner personally, what falls through the cracks, where follow-up dies.
- Never ask "what's your biggest problem" or "what's your bottleneck" — infer it from what they tell you.
- Ask about facts and processes, not feelings.
- Stop when you have enough to make a specific recommendation — you do not need to ask all 4-5.
- Keep questions concise and conversational. No long preambles.
- After enough info, respond with EXACTLY: "READY_TO_GENERATE" and nothing else.

If the user pastes documents or long descriptions, read them carefully, extract key info, then ask 2-3 targeted follow-up questions about gaps.`;

const REPORT_PROMPT = `Based on the following conversation about a business, generate a complete AI Business Audit report.

RULES:
1. Everything must be specific to THIS business. Never give generic advice.
2. The "First Build" must be something buildable in 2-4 hours in Claude Code.
3. Classify correctly: SKILL = run manually when needed. AGENT = runs automatically on a schedule or trigger.
4. Dollar estimates must show reasoning, not just numbers.
5. The paste-in-chat line must be specific enough that someone reading it knows exactly what to build.

Generate the report in this EXACT JSON format (no markdown, no backticks, just pure JSON):
{
  "businessName": "string - the business name or type",
  "businessSummary": "string - one sentence summary of what they do",
  "gaps": [
    {
      "name": "string - specific system name, not a category",
      "description": "string - what's happening manually and why it costs money",
      "weeklyCost": "string - estimated weekly dollar cost with reasoning"
    }
  ],
  "firstBuild": {
    "name": "string - specific skill or agent name",
    "type": "SKILL or AGENT",
    "whatItDoes": "string - exactly what it does, what it replaces, and how it works step by step",
    "whyFirst": "string - why this is the right first build for this specific business"
  },
  "vision": "string - 12-month vision paragraph using their actual business context. Make it feel real, not fantasy. Use their clients, offers, market.",
  "pasteInChat": "string - [Business type] → [Their specific constraint] → Build: [Exact name of the skill/agent]"
}`;

const colors = {
  bg: "#0a0e1a",
  cardBg: "#111827",
  cardBorder: "#1e293b",
  accent: "#c8a44e",
  accentDim: "rgba(200, 164, 78, 0.15)",
  accentGlow: "rgba(200, 164, 78, 0.3)",
  text: "#e2e8f0",
  textDim: "#94a3b8",
  textMuted: "#64748b",
  userBubble: "#1a2744",
  aiBubble: "#161e2e",
  inputBg: "#0f172a",
  success: "#34d399",
  white: "#ffffff",
};

const fonts = {
  heading: "'DM Serif Display', Georgia, serif",
  body: "'DM Sans', -apple-system, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

const callAPI = async (messages, systemPrompt) => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system: systemPrompt }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.content.map((c) => c.text || "").join("\n");
};

export default function App() {
  const [stage, setStage] = useState("welcome");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [dots, setDots] = useState("");
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (stage === "generating") {
      const interval = setInterval(() => {
        setDots((d) => (d.length >= 3 ? "" : d + "."));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [stage]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (stage === "chat" && !isLoading) {
      inputRef.current?.focus();
    }
  }, [stage, isLoading]);

  const startAudit = () => {
    setStage("chat");
    setMessages([
      {
        role: "assistant",
        content:
          "Let's get started. Two ways to do this:\n\n→ Option A: Paste any docs about your business — a bio, about page, strategy doc, anything. I'll read them and ask follow-ups.\n\n→ Option B: Tell me what your business does in a sentence or two and I'll interview you from there.\n\nWhich works?",
      },
    ]);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input.trim();
    setInput("");

    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setIsLoading(true);
    setError(null);

    try {
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await callAPI(apiMessages, SYSTEM_PROMPT);

      if (response.includes("READY_TO_GENERATE")) {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content:
              "I've got what I need. Generating your personalized AI Business Audit now...",
          },
        ]);
        setIsLoading(false);
        setStage("generating");
        await generateReport(newMessages);
      } else {
        setMessages([...newMessages, { role: "assistant", content: response }]);
        setIsLoading(false);
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
      console.error(err);
    }
  };

  const generateReport = async (conversationMessages) => {
    try {
      const conversationText = conversationMessages
        .map((m) => `${m.role === "user" ? "BUSINESS OWNER" : "AUDITOR"}: ${m.content}`)
        .join("\n\n");

      const reportMessages = [
        {
          role: "user",
          content: `Here is the full audit conversation:\n\n${conversationText}\n\nNow generate the complete AI Business Audit report as JSON. Remember: respond with ONLY valid JSON, no markdown, no backticks, no preamble.`,
        },
      ];

      const response = await callAPI(reportMessages, REPORT_PROMPT);
      const clean = response.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setReport(parsed);
      setStage("report");
    } catch (err) {
      console.error("Report generation error:", err);
      setError("Report generation failed. Please try again.");
      setStage("chat");
    }
  };

  const resetAudit = () => {
    setStage("welcome");
    setMessages([]);
    setInput("");
    setReport(null);
    setError(null);
    setCopied(false);
  };

  const containerStyle = {
    minHeight: "100vh",
    background: colors.bg,
    fontFamily: fonts.body,
    color: colors.text,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0",
    margin: "0",
    boxSizing: "border-box",
  };

  // ====== WELCOME ======
  if (stage === "welcome") {
    return (
      <div style={containerStyle}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "40px 24px",
          textAlign: "center",
          maxWidth: "640px",
        }}>
          <div style={{
            width: "72px",
            height: "72px",
            borderRadius: "20px",
            background: `linear-gradient(135deg, ${colors.accent}, #a08030)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "32px",
            boxShadow: `0 8px 32px ${colors.accentGlow}`,
          }}>
            <span style={{ fontSize: "32px", fontWeight: "700", color: colors.bg, fontFamily: fonts.heading }}>AI</span>
          </div>

          <h1 style={{
            fontFamily: fonts.heading,
            fontSize: "clamp(32px, 6vw, 48px)",
            fontWeight: "400",
            lineHeight: "1.15",
            margin: "0 0 16px 0",
            color: colors.white,
          }}>
            AI Business Audit
          </h1>

          <p style={{
            fontSize: "13px",
            fontFamily: fonts.mono,
            color: colors.accent,
            textTransform: "uppercase",
            letterSpacing: "2.5px",
            margin: "0 0 32px 0",
          }}>
            by Master Implementers
          </p>

          <p style={{
            fontSize: "18px",
            lineHeight: "1.7",
            color: colors.textDim,
            margin: "0 0 48px 0",
            maxWidth: "480px",
          }}>
            In 3-5 minutes, discover your single highest-leverage AI opportunity — the first thing to build that creates a real, measurable difference in your revenue or time.
          </p>

          <button
            onClick={startAudit}
            style={{
              background: `linear-gradient(135deg, ${colors.accent}, #a08030)`,
              color: colors.bg,
              border: "none",
              padding: "18px 48px",
              fontSize: "17px",
              fontWeight: "700",
              fontFamily: fonts.body,
              borderRadius: "12px",
              cursor: "pointer",
              letterSpacing: "0.5px",
              boxShadow: `0 4px 24px ${colors.accentGlow}`,
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => {
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = `0 8px 32px ${colors.accentGlow}`;
            }}
            onMouseOut={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = `0 4px 24px ${colors.accentGlow}`;
            }}
          >
            Start My Audit →
          </button>

          <p style={{
            fontSize: "13px",
            color: colors.textMuted,
            marginTop: "24px",
          }}>
            No signup required. Takes 3-5 minutes.
          </p>
        </div>
      </div>
    );
  }

  // ====== CHAT ======
  if (stage === "chat") {
    return (
      <div style={containerStyle}>
        <div style={{
          width: "100%",
          maxWidth: "720px",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
        }}>
          <div style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${colors.cardBorder}`,
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: `linear-gradient(135deg, ${colors.accent}, #a08030)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{ fontSize: "15px", fontWeight: "700", color: colors.bg }}>AI</span>
            </div>
            <div>
              <div style={{ fontWeight: "600", fontSize: "15px", color: colors.white }}>AI Business Audit</div>
              <div style={{ fontSize: "12px", color: colors.textMuted, fontFamily: fonts.mono }}>Master Implementers</div>
            </div>
          </div>

          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div style={{
                  maxWidth: "85%",
                  padding: "14px 18px",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: msg.role === "user" ? colors.userBubble : colors.aiBubble,
                  border: `1px solid ${msg.role === "user" ? "rgba(200,164,78,0.15)" : colors.cardBorder}`,
                  fontSize: "15px",
                  lineHeight: "1.65",
                  whiteSpace: "pre-wrap",
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  padding: "14px 18px",
                  borderRadius: "16px 16px 16px 4px",
                  background: colors.aiBubble,
                  border: `1px solid ${colors.cardBorder}`,
                  fontSize: "15px",
                  color: colors.textMuted,
                }}>
                  Thinking...
                </div>
              </div>
            )}

            {error && (
              <div style={{
                padding: "12px 16px",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "10px",
                color: "#f87171",
                fontSize: "14px",
              }}>
                {error}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <div style={{
            padding: "16px 24px 24px",
            borderTop: `1px solid ${colors.cardBorder}`,
          }}>
            <div style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-end",
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Tell me about your business..."
                rows={2}
                style={{
                  flex: 1,
                  background: colors.inputBg,
                  border: `1px solid ${colors.cardBorder}`,
                  borderRadius: "12px",
                  padding: "14px 16px",
                  color: colors.text,
                  fontSize: "15px",
                  fontFamily: fonts.body,
                  resize: "none",
                  outline: "none",
                  lineHeight: "1.5",
                }}
                onFocus={(e) => e.target.style.borderColor = colors.accent}
                onBlur={(e) => e.target.style.borderColor = colors.cardBorder}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                style={{
                  background: input.trim() ? `linear-gradient(135deg, ${colors.accent}, #a08030)` : colors.cardBorder,
                  color: input.trim() ? colors.bg : colors.textMuted,
                  border: "none",
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  cursor: input.trim() ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  flexShrink: 0,
                  transition: "all 0.2s ease",
                }}
              >
                ↑
              </button>
            </div>
            <div style={{
              textAlign: "center",
              marginTop: "10px",
              fontSize: "12px",
              color: colors.textMuted,
            }}>
              Press Enter to send
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ====== GENERATING ======
  if (stage === "generating") {
    return (
      <div style={containerStyle}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "40px 24px",
          textAlign: "center",
        }}>
          <div style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: colors.accentDim,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "32px",
            animation: "pulse 2s ease-in-out infinite",
          }}>
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${colors.accent}, #a08030)`,
              boxShadow: `0 0 32px ${colors.accentGlow}`,
            }} />
          </div>

          <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.15); opacity: 1; } }`}</style>

          <h2 style={{
            fontFamily: fonts.heading,
            fontSize: "28px",
            color: colors.white,
            margin: "0 0 12px",
          }}>
            Generating Your Audit{dots}
          </h2>

          <p style={{
            fontSize: "16px",
            color: colors.textDim,
            maxWidth: "400px",
          }}>
            Analyzing your business model, identifying gaps, and building your personalized recommendation.
          </p>
        </div>
      </div>
    );
  }

  // ====== REPORT ======
  if (stage === "report" && report) {
    return (
      <div style={containerStyle}>
        <div style={{
          width: "100%",
          maxWidth: "760px",
          padding: "40px 24px 80px",
        }}>
          {/* Report Header */}
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <p style={{
              fontFamily: fonts.mono,
              fontSize: "12px",
              color: colors.accent,
              textTransform: "uppercase",
              letterSpacing: "3px",
              margin: "0 0 12px",
            }}>
              AI Business Audit Report
            </p>
            <h1 style={{
              fontFamily: fonts.heading,
              fontSize: "clamp(28px, 5vw, 40px)",
              color: colors.white,
              margin: "0 0 8px",
              lineHeight: "1.2",
            }}>
              {report.businessName}
            </h1>
            <p style={{
              fontSize: "16px",
              color: colors.textDim,
              margin: "0",
            }}>
              {report.businessSummary}
            </p>
          </div>

          {/* Section 01 */}
          <div style={{ marginBottom: "40px" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
            }}>
              <span style={{
                fontFamily: fonts.mono,
                fontSize: "12px",
                color: colors.accent,
                letterSpacing: "1px",
              }}>01</span>
              <h2 style={{
                fontFamily: fonts.heading,
                fontSize: "24px",
                color: colors.white,
                margin: 0,
              }}>AI Gaps Specific to Your Business</h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {report.gaps?.map((gap, i) => (
                <div key={i} style={{
                  background: colors.cardBg,
                  border: `1px solid ${colors.cardBorder}`,
                  borderRadius: "14px",
                  padding: "24px",
                }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                    marginBottom: "12px",
                    flexWrap: "wrap",
                  }}>
                    <h3 style={{
                      fontSize: "17px",
                      fontWeight: "700",
                      color: colors.white,
                      margin: 0,
                    }}>
                      {gap.name}
                    </h3>
                    <span style={{
                      fontFamily: fonts.mono,
                      fontSize: "13px",
                      color: "#f87171",
                      background: "rgba(239,68,68,0.1)",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}>
                      {gap.weeklyCost}
                    </span>
                  </div>
                  <p style={{
                    fontSize: "14px",
                    lineHeight: "1.7",
                    color: colors.textDim,
                    margin: 0,
                  }}>
                    {gap.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 02 */}
          <div style={{ marginBottom: "40px" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
            }}>
              <span style={{
                fontFamily: fonts.mono,
                fontSize: "12px",
                color: colors.accent,
                letterSpacing: "1px",
              }}>02</span>
              <h2 style={{
                fontFamily: fonts.heading,
                fontSize: "24px",
                color: colors.white,
                margin: 0,
              }}>Your First High-Leverage Build</h2>
            </div>

            <div style={{
              background: `linear-gradient(135deg, rgba(200,164,78,0.08), rgba(200,164,78,0.02))`,
              border: `1px solid ${colors.accent}33`,
              borderRadius: "14px",
              padding: "28px",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "16px",
                flexWrap: "wrap",
              }}>
                <h3 style={{
                  fontSize: "20px",
                  fontWeight: "700",
                  color: colors.accent,
                  margin: 0,
                  fontFamily: fonts.heading,
                }}>
                  {report.firstBuild?.name}
                </h3>
                <span style={{
                  fontFamily: fonts.mono,
                  fontSize: "11px",
                  fontWeight: "700",
                  color: colors.bg,
                  background: report.firstBuild?.type === "AGENT" ? colors.success : colors.accent,
                  padding: "3px 10px",
                  borderRadius: "4px",
                  letterSpacing: "1px",
                }}>
                  {report.firstBuild?.type}
                </span>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <div style={{
                  fontSize: "12px",
                  fontFamily: fonts.mono,
                  color: colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  marginBottom: "8px",
                }}>What It Does</div>
                <p style={{
                  fontSize: "15px",
                  lineHeight: "1.7",
                  color: colors.text,
                  margin: 0,
                }}>
                  {report.firstBuild?.whatItDoes}
                </p>
              </div>

              <div>
                <div style={{
                  fontSize: "12px",
                  fontFamily: fonts.mono,
                  color: colors.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  marginBottom: "8px",
                }}>Why This First</div>
                <p style={{
                  fontSize: "15px",
                  lineHeight: "1.7",
                  color: colors.text,
                  margin: 0,
                }}>
                  {report.firstBuild?.whyFirst}
                </p>
              </div>
            </div>
          </div>

          {/* Section 03 */}
          <div style={{ marginBottom: "40px" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
            }}>
              <span style={{
                fontFamily: fonts.mono,
                fontSize: "12px",
                color: colors.accent,
                letterSpacing: "1px",
              }}>03</span>
              <h2 style={{
                fontFamily: fonts.heading,
                fontSize: "24px",
                color: colors.white,
                margin: 0,
              }}>Your 12-Month Vision</h2>
            </div>

            <div style={{
              background: colors.cardBg,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: "14px",
              padding: "28px",
            }}>
              <p style={{
                fontSize: "16px",
                lineHeight: "1.85",
                color: colors.text,
                margin: 0,
                fontStyle: "italic",
              }}>
                {report.vision}
              </p>
            </div>
          </div>

          {/* Section 04 */}
          <div style={{ marginBottom: "48px" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px",
            }}>
              <span style={{
                fontFamily: fonts.mono,
                fontSize: "12px",
                color: colors.accent,
                letterSpacing: "1px",
              }}>04</span>
              <h2 style={{
                fontFamily: fonts.heading,
                fontSize: "24px",
                color: colors.white,
                margin: 0,
              }}>Your Summary</h2>
            </div>

            <div
              style={{
                background: colors.inputBg,
                border: `1px dashed ${copied ? colors.success : colors.accent + "55"}`,
                borderRadius: "10px",
                padding: "20px",
                fontFamily: fonts.mono,
                fontSize: "14px",
                lineHeight: "1.7",
                color: copied ? colors.success : colors.accent,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onClick={() => {
                navigator.clipboard?.writeText(report.pasteInChat);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {report.pasteInChat}
              <div style={{
                fontSize: "11px",
                color: copied ? colors.success : colors.textMuted,
                marginTop: "10px",
                fontFamily: fonts.body,
              }}>
                {copied ? "✓ Copied!" : "Click to copy"}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div style={{
            background: `linear-gradient(135deg, rgba(200,164,78,0.12), rgba(200,164,78,0.04))`,
            border: `1px solid ${colors.accent}33`,
            borderRadius: "16px",
            padding: "36px 28px",
            textAlign: "center",
            marginBottom: "32px",
          }}>
            <h3 style={{
              fontFamily: fonts.heading,
              fontSize: "22px",
              color: colors.white,
              margin: "0 0 12px",
            }}>
              Ready to Implement This?
            </h3>
            <p style={{
              fontSize: "15px",
              color: colors.textDim,
              lineHeight: "1.7",
              margin: "0 0 28px",
              maxWidth: "480px",
              marginLeft: "auto",
              marginRight: "auto",
            }}>
              Book a free Personal Business Blueprint Call with Marc. You'll get a custom 90-day roadmap, root cause diagnosis, and quick wins you can act on immediately.
            </p>

            <a
              href="https://marcteo.com/work-with-us"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                background: `linear-gradient(135deg, ${colors.accent}, #a08030)`,
                color: colors.bg,
                padding: "16px 40px",
                borderRadius: "12px",
                fontSize: "16px",
                fontWeight: "700",
                fontFamily: fonts.body,
                textDecoration: "none",
                boxShadow: `0 4px 24px ${colors.accentGlow}`,
                transition: "all 0.2s ease",
              }}
            >
              Book Your Blueprint Call →
            </a>

            <div style={{
              marginTop: "20px",
              padding: "16px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: "10px",
            }}>
              <p style={{
                fontSize: "14px",
                color: colors.textDim,
                margin: 0,
              }}>
                Already working with Marc? Screenshot this report and send it over — he'll work through it with you directly.
              </p>
            </div>
          </div>

          {/* Start Over */}
          <div style={{ textAlign: "center" }}>
            <button
              onClick={resetAudit}
              style={{
                background: "none",
                border: `1px solid ${colors.cardBorder}`,
                color: colors.textMuted,
                padding: "12px 28px",
                borderRadius: "10px",
                fontSize: "14px",
                fontFamily: fonts.body,
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseOver={(e) => {
                e.target.style.borderColor = colors.textMuted;
                e.target.style.color = colors.text;
              }}
              onMouseOut={(e) => {
                e.target.style.borderColor = colors.cardBorder;
                e.target.style.color = colors.textMuted;
              }}
            >
              Start a New Audit
            </button>
          </div>

          {/* Footer */}
          <div style={{
            textAlign: "center",
            marginTop: "48px",
            paddingTop: "24px",
            borderTop: `1px solid ${colors.cardBorder}`,
          }}>
            <p style={{
              fontFamily: fonts.mono,
              fontSize: "11px",
              color: colors.textMuted,
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}>
              Powered by Master Implementers
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
