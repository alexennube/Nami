import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings2, Key, Cpu, Globe, Shield, Save, ExternalLink, CheckCircle2 } from "lucide-react";
import type { NamiConfig } from "@shared/schema";

const MODELS = [
  { value: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
  { value: "openai/gpt-4-turbo", label: "GPT-4 Turbo", provider: "OpenAI" },
  { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { value: "anthropic/claude-3-haiku", label: "Claude 3 Haiku", provider: "Anthropic" },
  { value: "google/gemini-pro-1.5", label: "Gemini Pro 1.5", provider: "Google" },
  { value: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", provider: "Meta" },
  { value: "mistralai/mixtral-8x7b-instruct", label: "Mixtral 8x7B", provider: "Mistral" },
  { value: "deepseek/deepseek-chat", label: "DeepSeek Chat", provider: "DeepSeek" },
];

export default function Settings() {
  const { data: config, isLoading } = useQuery<NamiConfig>({ queryKey: ["/api/config"] });
  const { toast } = useToast();

  const [apiKey, setApiKey] = useState("");
  const [defaultModel, setDefaultModel] = useState("openai/gpt-4o");
  const [siteUrl, setSiteUrl] = useState("https://agentnami.com");
  const [siteName, setSiteName] = useState("AgentNami");
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(10);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);

  useEffect(() => {
    if (config) {
      setApiKey(config.openRouterApiKey || "");
      setDefaultModel(config.defaultModel);
      setSiteUrl(config.siteUrl);
      setSiteName(config.siteName);
      setMaxConcurrentAgents(config.maxConcurrentAgents);
      setMaxTokens(config.maxTokensPerRequest);
      setTemperature(config.temperature);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/config", {
        openRouterApiKey: apiKey || undefined,
        defaultModel,
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
            Default model and inference parameters for new agents.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Default Model</Label>
            <Select value={defaultModel} onValueChange={setDefaultModel}>
              <SelectTrigger data-testid="select-default-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <span className="flex items-center gap-2">
                      {m.label}
                      <span className="text-[10px] text-muted-foreground">{m.provider}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
