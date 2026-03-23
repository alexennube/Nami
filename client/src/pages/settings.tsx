import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Settings2, Key, Waypoints, Globe, Save, ExternalLink, Search, Check, Loader2, Brain, Twitter, CheckCircle, XCircle, AlertTriangle, Send, Sparkles, Plug, Monitor, ClipboardList, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { NamiConfig } from "@shared/schema";

interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

type Provider = "openrouter" | "gemini" | "lmstudio";

function ProviderToggle({ value, onChange, testId }: { value: Provider; onChange: (v: Provider) => void; testId: string }) {
  return (
    <div className="flex rounded-md border border-input overflow-hidden" data-testid={testId}>
      <button
        type="button"
        className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${value === "openrouter" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
        onClick={() => onChange("openrouter")}
        data-testid={`${testId}-openrouter`}
      >
        OpenRouter
      </button>
      <button
        type="button"
        className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${value === "gemini" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
        onClick={() => onChange("gemini")}
        data-testid={`${testId}-gemini`}
      >
        Gemini
      </button>
      <button
        type="button"
        className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${value === "lmstudio" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
        onClick={() => onChange("lmstudio")}
        data-testid={`${testId}-lmstudio`}
      >
        LM Studio
      </button>
    </div>
  );
}

function ModelDropdown({
  models,
  isLoading,
  selectedModel,
  onSelect,
  allowDefault,
  testIdPrefix,
}: {
  models: ModelInfo[] | undefined;
  isLoading: boolean;
  selectedModel: string;
  onSelect: (id: string) => void;
  allowDefault?: boolean;
  testIdPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!models) return [];
    if (!search.trim()) return models;
    const q = search.toLowerCase();
    return models.filter(
      (m) => m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q))
    );
  }, [models, search]);

  const displayName = useMemo(() => {
    if (allowDefault && !selectedModel) return "Same as Nami model";
    if (!models) return selectedModel || "Select model";
    const found = models.find((m) => m.id === selectedModel);
    return found ? found.name || found.id : selectedModel || "Select model";
  }, [models, selectedModel, allowDefault]);

  return (
    <div className="relative">
      <Button
        variant="outline"
        className="w-full justify-between font-mono text-xs"
        onClick={() => setOpen(!open)}
        data-testid={`${testIdPrefix}-trigger`}
      >
        <span className="truncate">{displayName}</span>
        <Search className="w-3 h-3 ml-2 shrink-0 text-muted-foreground" />
      </Button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 border rounded-md bg-popover shadow-md">
          <div className="p-2 border-b">
            <div className="flex items-center gap-2 px-2">
              <Search className="w-3 h-3 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                autoFocus
                data-testid={`${testIdPrefix}-search`}
              />
            </div>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="p-1">
              {allowDefault && (
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-xs hover-elevate cursor-pointer"
                  onClick={() => { onSelect(""); setOpen(false); setSearch(""); }}
                  data-testid={`${testIdPrefix}-option-default`}
                >
                  <Check className={`w-3 h-3 shrink-0 ${!selectedModel ? "text-primary" : "invisible"}`} />
                  <span className="font-medium">Same as Nami model</span>
                </button>
              )}
              {isLoading ? (
                <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading models...
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No models found
                </div>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-xs hover-elevate cursor-pointer"
                    onClick={() => { onSelect(m.id); setOpen(false); setSearch(""); }}
                    data-testid={`${testIdPrefix}-option-${m.id}`}
                  >
                    <Check className={`w-3 h-3 shrink-0 ${selectedModel === m.id ? "text-primary" : "invisible"}`} />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-medium truncate">{m.name || m.id}</span>
                      <span className="text-[10px] text-muted-foreground font-mono truncate">{m.id}</span>
                    </div>
                    {m.context_length > 0 && (
                      <Badge variant="secondary" className="text-[9px] shrink-0 no-default-active-elevate">
                        {(m.context_length / 1000).toFixed(0)}k ctx
                      </Badge>
                    )}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { data: config, isLoading } = useQuery<NamiConfig>({ queryKey: ["/api/config"] });
  const { data: openRouterModels, isLoading: orModelsLoading } = useQuery<ModelInfo[]>({
    queryKey: ["/api/models"],
    staleTime: 5 * 60 * 1000,
  });
  const { data: geminiModels, isLoading: geminiModelsLoading } = useQuery<ModelInfo[]>({
    queryKey: ["/api/models/gemini"],
    staleTime: 5 * 60 * 1000,
  });
  const { data: googleAuthStatus } = useQuery<{ authenticated: boolean; missing: string[]; gogCLI?: { authenticated: boolean; accounts: string[] } }>({
    queryKey: ["/api/auth/google/status"],
  });
  const { toast } = useToast();

  const [apiKey, setApiKey] = useState("");
  const [namiProvider, setNamiProvider] = useState<Provider>("openrouter");
  const [engineProvider, setEngineProvider] = useState<Provider>("openrouter");
  const [lmStudioBaseUrl, setLmStudioBaseUrl] = useState("http://localhost:1234/v1");
  const [defaultModel, setDefaultModel] = useState("openai/gpt-4o");
  const [engineMindModel, setEngineMindModel] = useState("");
  const [engineMindEnabled, setEngineMindEnabled] = useState(false);
  const [siteUrl, setSiteUrl] = useState("https://agentnami.com");
  const [siteName, setSiteName] = useState("AgentNami");
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(10);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);

  const { data: lmStudioModels, isLoading: lmStudioModelsLoading } = useQuery<ModelInfo[]>({
    queryKey: ["/api/lmstudio/models"],
    enabled: namiProvider === "lmstudio" || engineProvider === "lmstudio",
    queryFn: async () => {
      const res = await fetch("/api/lmstudio/models", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    retry: false,
  });

  useEffect(() => {
    if (config) {
      setApiKey(config.openRouterApiKey || "");
      setNamiProvider(config.namiProvider || "openrouter");
      setEngineProvider(config.engineProvider || "openrouter");
      setLmStudioBaseUrl(config.lmStudioBaseUrl || "http://localhost:1234/v1");
      setDefaultModel(config.defaultModel);
      setEngineMindModel(config.engineMindModel || "");
      setEngineMindEnabled(config.engineMindEnabled || false);
      setSiteUrl(config.siteUrl);
      setSiteName(config.siteName);
      setMaxConcurrentAgents(config.maxConcurrentAgents);
      setMaxTokens(config.maxTokensPerRequest);
      setTemperature(config.temperature);
    }
  }, [config]);

  const namiModels = namiProvider === "lmstudio" ? lmStudioModels : namiProvider === "gemini" ? geminiModels : openRouterModels;
  const namiModelsLoading = namiProvider === "lmstudio" ? lmStudioModelsLoading : namiProvider === "gemini" ? geminiModelsLoading : orModelsLoading;
  const engineModels = engineProvider === "lmstudio" ? lmStudioModels : engineProvider === "gemini" ? geminiModels : openRouterModels;
  const engineModelsLoading = engineProvider === "lmstudio" ? lmStudioModelsLoading : engineProvider === "gemini" ? geminiModelsLoading : orModelsLoading;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/config", {
        openRouterApiKey: apiKey || undefined,
        namiProvider,
        engineProvider,
        lmStudioBaseUrl,
        defaultModel,
        engineMindModel,
        engineMindEnabled,
        siteUrl,
        siteName,
        maxConcurrentAgents,
        maxTokensPerRequest: maxTokens,
        temperature,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lmstudio/models"] });
      toast({ title: "Settings saved", description: "Configuration updated successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const testOpenRouterMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/config/test");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Connection successful", description: data.message || "OpenRouter API is reachable." });
    },
    onError: (err: Error) => {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    },
  });



  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6 p-3 md:p-6 max-w-[800px]">
        <Skeleton className="h-8 w-48" />
        {[...Array(3)].map((_, i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-3 md:p-6 max-w-[800px]">
      <div>
        <h1 className="text-base md:text-xl font-semibold tracking-tight" data-testid="text-settings-title">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure Nami's orchestration parameters</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">API Credentials</CardTitle>
          </div>
          <CardDescription className="text-[11px]">
            Configure API access for OpenRouter (400+ models) and/or Google Gemini (OAuth2).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key" className="text-xs">OpenRouter API Key</Label>
            <div className="flex gap-2">
              <Input
                id="api-key"
                type="password"
                placeholder="sk-or-v1-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="font-mono text-xs"
                data-testid="input-api-key"
              />
              <Button variant="outline" onClick={() => testOpenRouterMutation.mutate()} disabled={testOpenRouterMutation.isPending} data-testid="button-test-openrouter">
                {testOpenRouterMutation.isPending ? "Testing..." : "Test"}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary flex items-center gap-1">
                Get an API key <ExternalLink className="w-3 h-3" />
              </a>
              <Badge variant="outline" className="text-[9px]">BYOK</Badge>
            </div>
          </div>

          <div className="border-t pt-4 flex flex-col gap-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              Google Gemini (OAuth2)
            </Label>
            <div className="flex items-center gap-2">
              {googleAuthStatus?.authenticated ? (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Google authenticated</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Not authenticated</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Google accounts are managed on the{" "}
              <a href="/integrations" className="text-primary underline" data-testid="link-integrations-from-settings">Integrations page</a>.
            </p>
          </div>

          <div className="border-t pt-4 flex flex-col gap-2">
            <Label className="text-xs flex items-center gap-1.5">
              <Monitor className="w-3 h-3" />
              LM Studio (Local Inference)
            </Label>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lmstudio-url" className="text-[11px] text-muted-foreground">Server URL</Label>
              <Input
                id="lmstudio-url"
                type="text"
                placeholder="http://localhost:1234/v1"
                value={lmStudioBaseUrl}
                onChange={(e) => setLmStudioBaseUrl(e.target.value)}
                className="font-mono text-xs"
                data-testid="input-lmstudio-url"
              />
              <p className="text-[10px] text-muted-foreground">
                Point to your LM Studio local server. Start LM Studio, load a model, and enable the server.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Waypoints className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">Nami Inference</CardTitle>
          </div>
          <CardDescription className="text-[11px]">
            Provider and model for Nami chat, heartbeat, and spawn agents.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Provider</Label>
            <ProviderToggle value={namiProvider} onChange={setNamiProvider} testId="toggle-nami-provider" />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Default Model</Label>
            <ModelDropdown
              models={namiModels}
              isLoading={namiModelsLoading}
              selectedModel={defaultModel}
              onSelect={setDefaultModel}
              testIdPrefix="select-default-model"
            />
            <span className="text-[10px] text-muted-foreground font-mono">{defaultModel}</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Temperature</Label>
              <span className="text-xs font-mono text-muted-foreground">{temperature.toFixed(1)}</span>
            </div>
            <Slider
              value={[temperature]}
              onValueChange={([v]) => setTemperature(v)}
              min={0}
              max={2}
              step={0.1}
              data-testid="slider-temperature"
            />
            <span className="text-[10px] text-muted-foreground">Lower values are more focused, higher values are more creative</span>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Max Tokens Per Request</Label>
            <Input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              min={256}
              max={128000}
              data-testid="input-max-tokens"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Max Concurrent Agents</Label>
            <Input
              type="number"
              value={maxConcurrentAgents}
              onChange={(e) => setMaxConcurrentAgents(Number(e.target.value))}
              min={1}
              max={100}
              data-testid="input-max-agents"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">Engine Mind + Swarm Queens</CardTitle>
          </div>
          <CardDescription className="text-[11px]">
            Provider and model for Engine Mind (Pi framework) and all Swarm Queen agents. Self-healing, spawn validation, and auto-compaction.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Enable Engine Mind</Label>
            <Switch
              checked={engineMindEnabled}
              onCheckedChange={setEngineMindEnabled}
              data-testid="switch-engine-mind"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Provider</Label>
            <ProviderToggle value={engineProvider} onChange={setEngineProvider} testId="toggle-engine-provider" />
            <span className="text-[10px] text-muted-foreground">This provider is shared by Engine Mind and all Swarm Queens</span>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Model</Label>
            <ModelDropdown
              models={engineModels}
              isLoading={engineModelsLoading}
              selectedModel={engineMindModel}
              onSelect={setEngineMindModel}
              allowDefault
              testIdPrefix="select-engine-model"
            />
            <span className="text-[10px] text-muted-foreground">
              {engineMindModel ? <span className="font-mono">{engineMindModel}</span> : "Uses the Nami default model when empty"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">Site Identity</CardTitle>
          </div>
          <CardDescription className="text-[11px]">
            Used in OpenRouter request headers for attribution and analytics.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Site Name</Label>
            <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} data-testid="input-site-name" />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Site URL</Label>
            <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} data-testid="input-site-url" />
          </div>
        </CardContent>
      </Card>

      <XIntegrationCard />

      <NamiextendCard />

      <AuditTrailCard />

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-settings">
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

function XIntegrationCard() {
  const { toast } = useToast();
  const [tweetText, setTweetText] = useState("");

  const { data: xStatus, isLoading } = useQuery<{ configured: boolean; missing: string[] }>({
    queryKey: ["/api/x/status"],
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/x/test");
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({ title: "Test tweet posted", description: `Tweet ID: ${data.tweetId}` });
      } else {
        toast({ title: "Test failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  const postMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/x/post", { text });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        setTweetText("");
        toast({ title: "Tweet posted", description: `Tweet ID: ${data.tweetId}` });
      } else {
        toast({ title: "Post failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Post failed", description: err.message, variant: "destructive" });
    },
  });

  const configured = xStatus?.configured ?? false;
  const missing = xStatus?.missing ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Twitter className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm">X (Twitter) Integration</CardTitle>
          {!isLoading && (
            <Badge variant={configured ? "default" : "secondary"} className="text-[9px] ml-auto no-default-active-elevate">
              {configured ? "Connected" : "Not Configured"}
            </Badge>
          )}
        </div>
        <CardDescription className="text-[11px]">
          Post tweets from Nami, spawns, and swarms via OAuth 1.0a. Tools: x_post_tweet, x_delete_tweet, x_get_status.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs">Credential Status</Label>
          {isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : configured ? (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>All 4 credentials configured (API Key, API Secret, Access Token, Access Token Secret)</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Missing credentials: {missing.join(", ")}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Add X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, and X_ACCESS_TOKEN_SECRET as environment secrets.
                Get them from <a href="https://developer.x.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">developer.x.com</a>.
              </p>
            </div>
          )}
        </div>

        {configured && (
          <>
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Test Connection</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                data-testid="button-x-test"
              >
                {testMutation.isPending ? (
                  <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Posting test tweet...</>
                ) : (
                  <><Send className="w-3 h-3 mr-1.5" /> Send Test Tweet</>
                )}
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs">Quick Post</Label>
              <Textarea
                value={tweetText}
                onChange={(e) => setTweetText(e.target.value)}
                placeholder="Type a tweet..."
                className="text-xs min-h-[60px] resize-none"
                maxLength={280}
                data-testid="input-x-tweet"
              />
              <div className="flex items-center justify-between">
                <span className={`text-[10px] ${tweetText.length > 260 ? "text-amber-400" : "text-muted-foreground"}`}>
                  {tweetText.length}/280
                </span>
                <Button
                  size="sm"
                  onClick={() => postMutation.mutate(tweetText)}
                  disabled={!tweetText.trim() || postMutation.isPending}
                  data-testid="button-x-post"
                >
                  {postMutation.isPending ? (
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Posting...</>
                  ) : (
                    <><Send className="w-3 h-3 mr-1.5" /> Post to X</>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}

        <div className="border-t pt-3">
          <p className="text-[10px] text-muted-foreground">
            Nami and swarm agents can use the <span className="font-mono">x_post_tweet</span>, <span className="font-mono">x_delete_tweet</span>, and <span className="font-mono">x_get_status</span> tools
            to interact with your X account autonomously. Enable/disable them on the Tools page.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function NamiextendCard() {
  const { toast } = useToast();
  const [password, setPassword] = useState("");

  const { data: status } = useQuery<{ connected: boolean; clients: number; wsUrl: string }>({
    queryKey: ["/api/namiextend/status"],
    refetchInterval: 5000,
  });

  const { data: tokenInfo } = useQuery<{ hasToken: boolean }>({
    queryKey: ["/api/namiextend/token"],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/namiextend/token", { token: password });
      return res.json();
    },
    onSuccess: () => {
      setPassword("");
      toast({ title: "Password saved", description: "Namiextend connection password has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/namiextend/token"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm">Browser Extension (Namiextend)</CardTitle>
          {status?.connected ? (
            <Badge variant="outline" className="ml-auto text-[10px] border-green-500 text-green-400">
              <Plug className="w-3 h-3 mr-1" /> {status.clients} connected
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-auto text-[10px] border-muted-foreground text-muted-foreground">
              Disconnected
            </Badge>
          )}
        </div>
        <CardDescription className="text-[11px]">
          Connect your browser extension to allow Nami to control browser actions.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs">WebSocket URL</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={status?.wsUrl || "Loading..."}
              className="text-xs font-mono"
              data-testid="input-namiextend-url"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(status?.wsUrl || "");
                toast({ title: "Copied", description: "WebSocket URL copied to clipboard." });
              }}
              data-testid="button-copy-namiextend-url"
            >
              Copy
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs">
            Connection Password
            {tokenInfo?.hasToken && (
              <span className="ml-2 text-green-400 text-[10px]">(set)</span>
            )}
          </Label>
          <div className="flex gap-2">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tokenInfo?.hasToken ? "Enter new password to change" : "Set a password (min 4 chars)"}
              className="text-xs"
              data-testid="input-namiextend-password"
            />
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={password.length < 4 || saveMutation.isPending}
              data-testid="button-save-namiextend-password"
            >
              {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            </Button>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-[10px] text-muted-foreground">
            Your extension should send <span className="font-mono">{"{ type: \"auth\", token: \"<your password>\" }"}</span> as
            its first message after connecting. Nami can then use the <span className="font-mono">browser_control</span> tool
            to click, type, scroll, navigate, or read page content in your browser.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  recordType: string;
  recordId: string;
  recordName: string;
  actorType: string;
  actorName: string;
  summary: string;
}

function AuditTrailCard() {
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterRecordType, setFilterRecordType] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchText, setSearchText] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const limit = 20;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", String(limit));
  if (filterAction !== "all") queryParams.set("action", filterAction);
  if (filterRecordType !== "all") queryParams.set("recordType", filterRecordType);
  if (startDate) queryParams.set("startDate", new Date(startDate).toISOString());
  if (endDate) queryParams.set("endDate", new Date(endDate + "T23:59:59").toISOString());
  if (debouncedSearch) queryParams.set("search", debouncedSearch);

  const { data, isLoading } = useQuery<{ entries: AuditEntry[]; total: number; page: number; limit: number }>({
    queryKey: ["/api/audit-log", page, filterAction, filterRecordType, startDate, endDate, debouncedSearch],
    queryFn: async () => {
      const res = await fetch(`/api/audit-log?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  const handleCsvDownload = () => {
    const a = document.createElement("a");
    a.href = "/api/audit-log/csv";
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const actionColors: Record<string, string> = {
    created: "bg-green-500/10 text-green-600",
    updated: "bg-blue-500/10 text-blue-600",
    deleted: "bg-red-500/10 text-red-600",
    executed: "bg-purple-500/10 text-purple-600",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm">Audit Trail</CardTitle>
          <Badge variant="secondary" className="text-[9px] ml-auto no-default-active-elevate">
            {data?.total ?? 0} entries
          </Badge>
        </div>
        <CardDescription className="text-[11px]">
          Track all changes across agents, swarms, configs, and records.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search records..."
              className="w-[160px] h-8 text-xs pl-7"
              data-testid="input-audit-search"
            />
          </div>
          <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(1); }}>
            <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-audit-action">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="updated">Updated</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
              <SelectItem value="executed">Executed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterRecordType} onValueChange={(v) => { setFilterRecordType(v); setPage(1); }}>
            <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-audit-record-type">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="swarm">Swarm</SelectItem>
              <SelectItem value="config">Config</SelectItem>
              <SelectItem value="memory">Memory</SelectItem>
              <SelectItem value="doc_page">Doc Page</SelectItem>
              <SelectItem value="kanban_card">Kanban Card</SelectItem>
              <SelectItem value="crm_account">CRM Account</SelectItem>
              <SelectItem value="crm_contact">CRM Contact</SelectItem>
              <SelectItem value="crm_sequence">CRM Sequence</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="w-[130px] h-8 text-xs"
            placeholder="Start date"
            data-testid="input-audit-start-date"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="w-[130px] h-8 text-xs"
            placeholder="End date"
            data-testid="input-audit-end-date"
          />
          <Button variant="outline" size="sm" className="ml-auto h-8 text-xs" onClick={handleCsvDownload} data-testid="button-download-audit-csv">
            <Download className="w-3 h-3 mr-1" />
            CSV
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : !data?.entries?.length ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No audit entries found.
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="table-audit-log">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left p-2 font-medium">Time</th>
                    <th className="text-left p-2 font-medium">Action</th>
                    <th className="text-left p-2 font-medium">Type</th>
                    <th className="text-left p-2 font-medium">Record</th>
                    <th className="text-left p-2 font-medium">Actor</th>
                    <th className="text-left p-2 font-medium">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-audit-${entry.id}`}>
                      <td className="p-2 whitespace-nowrap text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${actionColors[entry.action] || "bg-muted text-muted-foreground"}`}>
                          {entry.action}
                        </span>
                      </td>
                      <td className="p-2 whitespace-nowrap">{entry.recordType.replace(/_/g, " ")}</td>
                      <td className="p-2 max-w-[150px] truncate" title={entry.recordName}>{entry.recordName}</td>
                      <td className="p-2 whitespace-nowrap">
                        <span className="text-muted-foreground">{entry.actorName}</span>
                      </td>
                      <td className="p-2 max-w-[200px] truncate text-muted-foreground" title={entry.summary}>{entry.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              Page {page} of {totalPages} ({data?.total} total)
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-audit-prev">
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-audit-next">
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
