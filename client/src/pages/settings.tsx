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
import { Settings2, Key, Cpu, Globe, Save, ExternalLink, Search, Check, Loader2, Brain } from "lucide-react";
import type { NamiConfig } from "@shared/schema";

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export default function Settings() {
  const { data: config, isLoading } = useQuery<NamiConfig>({ queryKey: ["/api/config"] });
  const { data: models, isLoading: modelsLoading } = useQuery<OpenRouterModel[]>({
    queryKey: ["/api/models"],
    staleTime: 5 * 60 * 1000,
  });
  const { toast } = useToast();

  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("openai/gpt-4o");
  const [swarmQueenModel, setSwarmQueenModel] = useState("");
  const [engineMindModel, setEngineMindModel] = useState("");
  const [engineMindEnabled, setEngineMindEnabled] = useState(false);
  const [siteUrl, setSiteUrl] = useState("https://agentnami.com");
  const [siteName, setSiteName] = useState("AgentNami");
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(10);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);
  const [modelSearch, setModelSearch] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [queenModelSearch, setQueenModelSearch] = useState("");
  const [queenModelDropdownOpen, setQueenModelDropdownOpen] = useState(false);
  const [mindModelSearch, setMindModelSearch] = useState("");
  const [mindModelDropdownOpen, setMindModelDropdownOpen] = useState(false);

  useEffect(() => {
    if (config) {
      setApiKey(config.openRouterApiKey || "");
      setDefaultModel(config.defaultModel);
      setSwarmQueenModel(config.swarmQueenModel || "");
      setEngineMindModel(config.engineMindModel || "");
      setEngineMindEnabled(config.engineMindEnabled || false);
      setSiteUrl(config.siteUrl);
      setSiteName(config.siteName);
      setMaxConcurrentAgents(config.maxConcurrentAgents);
      setMaxTokens(config.maxTokensPerRequest);
      setTemperature(config.temperature);
    }
  }, [config]);

  const filteredModels = useMemo(() => {
    if (!models) return [];
    if (!modelSearch.trim()) return models;
    const q = modelSearch.toLowerCase();
    return models.filter(
      (m) => m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q))
    );
  }, [models, modelSearch]);

  const selectedModelName = useMemo(() => {
    if (!models) return defaultModel;
    const found = models.find((m) => m.id === defaultModel);
    return found ? found.name || found.id : defaultModel;
  }, [models, defaultModel]);

  const filteredQueenModels = useMemo(() => {
    if (!models) return [];
    if (!queenModelSearch.trim()) return models;
    const q = queenModelSearch.toLowerCase();
    return models.filter(
      (m) => m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q))
    );
  }, [models, queenModelSearch]);

  const selectedQueenModelName = useMemo(() => {
    if (!swarmQueenModel) return "Same as default model";
    if (!models) return swarmQueenModel;
    const found = models.find((m) => m.id === swarmQueenModel);
    return found ? found.name || found.id : swarmQueenModel;
  }, [models, swarmQueenModel]);

  const filteredMindModels = useMemo(() => {
    if (!models) return [];
    if (!mindModelSearch.trim()) return models;
    const q = mindModelSearch.toLowerCase();
    return models.filter(
      (m) => m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q))
    );
  }, [models, mindModelSearch]);

  const selectedMindModelName = useMemo(() => {
    if (!engineMindModel) return "Same as default model";
    if (!models) return engineMindModel;
    const found = models.find((m) => m.id === engineMindModel);
    return found ? found.name || found.id : engineMindModel;
  }, [models, engineMindModel]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/config", {
        openRouterApiKey: apiKey || undefined,
        defaultModel,
        swarmQueenModel,
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
      toast({ title: "Settings saved", description: "Configuration updated successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
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
      <div className="flex flex-col gap-6 p-6 max-w-[800px]">
        <Skeleton className="h-8 w-48" />
        {[...Array(3)].map((_, i) => (
          <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[800px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-settings-title">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure Nami's orchestration parameters</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">OpenRouter API Key</CardTitle>
          </div>
          <CardDescription className="text-[11px]">
            Your key for accessing 400+ AI models via OpenRouter.ai. Supports BYOK for enterprise deployment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key" className="text-xs">API Key</Label>
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
              <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} data-testid="button-test-connection">
                {testMutation.isPending ? "Testing..." : "Test"}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary flex items-center gap-1">
              Get an API key <ExternalLink className="w-3 h-3" />
            </a>
            <Badge variant="outline" className="text-[9px]">BYOK</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm">Model Configuration</CardTitle>
          </div>
          <CardDescription className="text-[11px]">
            Default model and inference parameters for new agents. {models ? `${models.length} models available.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Default Model</Label>
            <div className="relative">
              <Button
                variant="outline"
                className="w-full justify-between font-mono text-xs"
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                data-testid="select-default-model"
              >
                <span className="truncate">{selectedModelName}</span>
                <Search className="w-3 h-3 ml-2 shrink-0 text-muted-foreground" />
              </Button>

              {modelDropdownOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 border rounded-md bg-popover shadow-md">
                  <div className="p-2 border-b">
                    <div className="flex items-center gap-2 px-2">
                      <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        placeholder="Search models..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                        autoFocus
                        data-testid="input-model-search"
                      />
                    </div>
                  </div>
                  <ScrollArea className="h-[300px]">
                    <div className="p-1">
                      {modelsLoading ? (
                        <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading models...
                        </div>
                      ) : filteredModels.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          No models found
                        </div>
                      ) : (
                        filteredModels.map((m) => (
                          <button
                            key={m.id}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-xs hover-elevate cursor-pointer"
                            onClick={() => {
                              setDefaultModel(m.id);
                              setModelDropdownOpen(false);
                              setModelSearch("");
                            }}
                            data-testid={`option-model-${m.id}`}
                          >
                            <Check className={`w-3 h-3 shrink-0 ${defaultModel === m.id ? "text-primary" : "invisible"}`} />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-medium truncate">{m.name || m.id}</span>
                              <span className="text-[10px] text-muted-foreground font-mono truncate">{m.id}</span>
                            </div>
                            {m.context_length && (
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
            <span className="text-[10px] text-muted-foreground font-mono">{defaultModel}</span>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">SwarmQueen Model</Label>
            <div className="relative">
              <Button
                variant="outline"
                className="w-full justify-between font-mono text-xs"
                onClick={() => setQueenModelDropdownOpen(!queenModelDropdownOpen)}
                data-testid="select-queen-model"
              >
                <span className="truncate">{selectedQueenModelName}</span>
                <Search className="w-3 h-3 ml-2 shrink-0 text-muted-foreground" />
              </Button>

              {queenModelDropdownOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 border rounded-md bg-popover shadow-md">
                  <div className="p-2 border-b">
                    <div className="flex items-center gap-2 px-2">
                      <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        placeholder="Search models..."
                        value={queenModelSearch}
                        onChange={(e) => setQueenModelSearch(e.target.value)}
                        className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                        autoFocus
                        data-testid="input-queen-model-search"
                      />
                    </div>
                  </div>
                  <ScrollArea className="h-[300px]">
                    <div className="p-1">
                      <button
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-xs hover-elevate cursor-pointer"
                        onClick={() => {
                          setSwarmQueenModel("");
                          setQueenModelDropdownOpen(false);
                          setQueenModelSearch("");
                        }}
                        data-testid="option-queen-model-default"
                      >
                        <Check className={`w-3 h-3 shrink-0 ${!swarmQueenModel ? "text-primary" : "invisible"}`} />
                        <span className="font-medium">Same as default model</span>
                      </button>
                      {modelsLoading ? (
                        <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading models...
                        </div>
                      ) : filteredQueenModels.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          No models found
                        </div>
                      ) : (
                        filteredQueenModels.map((m) => (
                          <button
                            key={m.id}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-xs hover-elevate cursor-pointer"
                            onClick={() => {
                              setSwarmQueenModel(m.id);
                              setQueenModelDropdownOpen(false);
                              setQueenModelSearch("");
                            }}
                            data-testid={`option-queen-model-${m.id}`}
                          >
                            <Check className={`w-3 h-3 shrink-0 ${swarmQueenModel === m.id ? "text-primary" : "invisible"}`} />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-medium truncate">{m.name || m.id}</span>
                              <span className="text-[10px] text-muted-foreground font-mono truncate">{m.id}</span>
                            </div>
                            {m.context_length && (
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
            <span className="text-[10px] text-muted-foreground">
              {swarmQueenModel ? <span className="font-mono">{swarmQueenModel}</span> : "Uses the default model when empty"}
            </span>
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
            <CardTitle className="text-sm">Engine Mind (Pi Framework)</CardTitle>
          </div>
          <CardDescription className="text-[11px]">
            Self-healing tool execution, spawn validation, and auto-compaction via Pi agent framework.
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
            <Label className="text-xs">Engine Mind Model</Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMindModelDropdownOpen(!mindModelDropdownOpen)}
                className="flex items-center justify-between w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="select-mind-model"
              >
                <span className="truncate">{selectedMindModelName}</span>
                <Search className="w-3 h-3 ml-2 shrink-0 opacity-50" />
              </button>
              {mindModelDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                  <div className="p-2">
                    <Input
                      placeholder="Search models..."
                      value={mindModelSearch}
                      onChange={(e) => setMindModelSearch(e.target.value)}
                      className="h-7 text-xs"
                      autoFocus
                      data-testid="input-mind-model-search"
                    />
                  </div>
                  <ScrollArea className="h-[300px]">
                    <div className="p-1">
                      <button
                        className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs hover:bg-accent"
                        onClick={() => { setEngineMindModel(""); setMindModelDropdownOpen(false); }}
                      >
                        {!engineMindModel && <Check className="w-3 h-3" />}
                        <span className={!engineMindModel ? "" : "ml-5"}>Same as default model</span>
                      </button>
                      {modelsLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      ) : (
                        filteredMindModels.map((m) => (
                          <button
                            key={m.id}
                            className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs hover:bg-accent text-left"
                            onClick={() => { setEngineMindModel(m.id); setMindModelDropdownOpen(false); setMindModelSearch(""); }}
                          >
                            {engineMindModel === m.id && <Check className="w-3 h-3 shrink-0" />}
                            <span className={`truncate ${engineMindModel === m.id ? "" : "ml-5"}`}>{m.name || m.id}</span>
                            {m.context_length && (
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
            <span className="text-[10px] text-muted-foreground">
              {engineMindModel ? <span className="font-mono">{engineMindModel}</span> : "Uses the default model when empty"}
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

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-settings">
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
