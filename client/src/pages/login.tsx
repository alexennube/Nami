import { useState } from "react";
import { Cpu } from "lucide-react";

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      if (res.ok) {
        onLogin();
      } else {
        const data = await res.json();
        setError(data.message || "Login failed");
      }
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden" data-testid="page-login">
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, #00ff41 2px, #00ff41 3px)`,
        animation: "scanline 8s linear infinite",
      }} />

      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse at center, rgba(0,255,65,0.03) 0%, transparent 70%)",
      }} />

      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-xl opacity-30" style={{ backgroundColor: "#00ff41" }} />
            <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl border-2" style={{ borderColor: "#00ff41", backgroundColor: "rgba(0,255,65,0.08)" }}>
              <Cpu className="w-10 h-10" style={{ color: "#00ff41" }} />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-widest" style={{ color: "#00ff41", textShadow: "0 0 20px rgba(0,255,65,0.5), 0 0 40px rgba(0,255,65,0.2)" }} data-testid="text-nami-title">
            NAMI
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full px-4 py-3 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 transition-all"
              style={{
                backgroundColor: "rgba(0,255,65,0.05)",
                border: "1px solid rgba(0,255,65,0.3)",
                color: "#00ff41",
                caretColor: "#00ff41",
              }}
              onFocus={(e) => e.target.style.borderColor = "#00ff41"}
              onBlur={(e) => e.target.style.borderColor = "rgba(0,255,65,0.3)"}
              autoComplete="username"
              data-testid="input-username"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 transition-all"
              style={{
                backgroundColor: "rgba(0,255,65,0.05)",
                border: "1px solid rgba(0,255,65,0.3)",
                color: "#00ff41",
                caretColor: "#00ff41",
              }}
              onFocus={(e) => e.target.style.borderColor = "#00ff41"}
              onBlur={(e) => e.target.style.borderColor = "rgba(0,255,65,0.3)"}
              autoComplete="current-password"
              data-testid="input-password"
            />
          </div>

          {error && (
            <p className="text-xs font-mono text-center" style={{ color: "#ff4141" }} data-testid="text-login-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-3 rounded-lg text-sm font-bold font-mono tracking-wider transition-all disabled:opacity-40"
            style={{
              backgroundColor: "rgba(0,255,65,0.15)",
              border: "1px solid #00ff41",
              color: "#00ff41",
              textShadow: "0 0 10px rgba(0,255,65,0.5)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(0,255,65,0.25)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(0,255,65,0.15)"; }}
            data-testid="button-login"
          >
            {loading ? "AUTHENTICATING..." : "LOGIN"}
          </button>
        </form>
      </div>

      <div className="absolute bottom-6 text-center" data-testid="text-copyright">
        <p className="text-xs font-mono" style={{ color: "rgba(0,255,65,0.5)" }}>
          &copy; {new Date().getFullYear()} AgentNami.com
        </p>
      </div>

      <style>{`
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        input::placeholder {
          color: rgba(0,255,65,0.3) !important;
        }
        input:focus {
          ring-color: rgba(0,255,65,0.5);
          box-shadow: 0 0 15px rgba(0,255,65,0.1);
        }
      `}</style>
    </div>
  );
}
