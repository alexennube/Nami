import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Star, Trash2, TestTube, ExternalLink, CheckCircle, AlertTriangle, Loader2, Mail } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface GoogleAccount {
  id: string;
  email: string;
  is_default: boolean;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export default function Integrations() {
  const { toast } = useToast();

  const { data: accounts, isLoading } = useQuery<GoogleAccount[]>({
    queryKey: ["/api/integrations/google/accounts"],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get("google_auth");
    const message = params.get("message");

    if (authResult === "success") {
      toast({ title: "Google account connected", description: "Your Google account has been linked successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/google/accounts"] });
      window.history.replaceState({}, "", "/integrations");
    } else if (authResult === "error") {
      toast({ title: "Authentication failed", description: message || "Could not connect Google account.", variant: "destructive" });
      window.history.replaceState({}, "", "/integrations");
    }
  }, []);

  const addAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/integrations/google/auth");
      const data = await res.json();
      window.open(data.authUrl, "_blank");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PUT", `/api/integrations/google/accounts/${id}/default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/google/accounts"] });
      toast({ title: "Default account updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/integrations/google/accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/google/accounts"] });
      toast({ title: "Account removed" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/integrations/google/accounts/${id}/test`);
      return await res.json();
    },
    onSuccess: (data: { success: boolean; message: string }) => {
      toast({
        title: data.success ? "Connection OK" : "Connection failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const callbackUrl = `${window.location.origin}/api/auth/google/callback`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b shrink-0">
        <h1 className="text-lg font-semibold" data-testid="text-integrations-title">Integrations</h1>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Google Accounts
                </CardTitle>
                <CardDescription className="mt-1">
                  Connect Google accounts for Gemini AI inference and Google Workspace access (Gmail, Calendar, Drive).
                  The default account is used for API access.
                </CardDescription>
              </div>
              <Button
                onClick={() => addAccountMutation.mutate()}
                disabled={addAccountMutation.isPending}
                data-testid="button-add-google-account"
              >
                {addAccountMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Add Account
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : accounts && accounts.length > 0 ? (
              <div className="space-y-3">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center gap-4 p-3 rounded-lg border bg-card"
                    data-testid={`card-google-account-${account.id}`}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={account.avatar_url || undefined} alt={account.email} />
                      <AvatarFallback>{account.email.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate" data-testid={`text-account-email-${account.id}`}>
                          {account.email}
                        </span>
                        {account.is_default && (
                          <Badge variant="default" className="text-[10px] shrink-0" data-testid={`badge-default-${account.id}`}>
                            <Star className="w-3 h-3 mr-1" /> Default
                          </Badge>
                        )}
                      </div>
                      {account.display_name && (
                        <span className="text-xs text-muted-foreground">{account.display_name}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground block">
                        Connected {new Date(account.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!account.is_default && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDefaultMutation.mutate(account.id)}
                          disabled={setDefaultMutation.isPending}
                          data-testid={`button-set-default-${account.id}`}
                        >
                          <Star className="w-3 h-3 mr-1" /> Set Default
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testMutation.mutate(account.id)}
                        disabled={testMutation.isPending}
                        data-testid={`button-test-${account.id}`}
                      >
                        {testMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Remove ${account.email}?`)) {
                            deleteMutation.mutate(account.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-remove-${account.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-accounts">
                <Mail className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No Google accounts connected</p>
                <p className="text-xs mt-1">Click "Add Account" to connect your first Google account.</p>
              </div>
            )}

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <CheckCircle className="w-3 h-3 mt-0.5 shrink-0 text-emerald-500" />
                <span>The default account's credentials are used for Gemini AI inference and Google Workspace tools (gogCLI).</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                <span>Make sure to add this as an authorized redirect URI in your Google Cloud Console:</span>
              </div>
              <code className="block text-[11px] bg-muted/50 px-3 py-1.5 rounded font-mono break-all" data-testid="text-callback-url">
                {callbackUrl}
              </code>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              More Integrations Coming Soon
            </CardTitle>
            <CardDescription className="text-xs">
              X (Twitter), Slack, and other integrations will be available here in future updates.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
