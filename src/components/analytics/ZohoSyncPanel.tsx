import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  records_synced: number;
  records_failed: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface Integration {
  id: string;
  name: string;
  is_enabled: boolean;
  last_sync_at: string | null;
  config: Record<string, any> | null;
}

const ZohoSyncPanel = () => {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "connected" | "failed">("unknown");
  const { toast } = useToast();
  const { orgId } = useAuth();

  const fetchData = async () => {
    try {
      // Fetch Zoho integration config
      const { data: integrationData } = await supabase
        .from("integrations")
        .select("*")
        .eq("name", "zoho")
        .maybeSingle();

      if (integrationData) {
        setIntegration({
          ...integrationData,
          config: (integrationData.config as Record<string, any>) || {},
          is_enabled: integrationData.is_enabled ?? false,
        });
      }

      // Fetch recent sync logs
      const { data: logs } = await supabase
        .from("zoho_sync_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);

      setSyncLogs(logs || []);
    } catch (error) {
      console.error("Error fetching Zoho sync data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionStatus("unknown");
    try {
      const { data, error } = await supabase.functions.invoke("zoho-sync", {
        body: { action: "test_connection", orgId },
      });

      if (error) throw error;

      if (data.success) {
        setConnectionStatus("connected");
        toast({
          title: "Connection Successful",
          description: "Successfully connected to Zoho API",
        });
      } else {
        setConnectionStatus("failed");
        toast({
          title: "Connection Failed",
          description: data.error || "Failed to connect to Zoho",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      setConnectionStatus("failed");
      toast({
        title: "Connection Error",
        description: error.message || "Failed to test connection",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async (syncType: string) => {
    setSyncing(true);
    try {
      // Create sync log entry
      const { data: logEntry } = await supabase
        .from("zoho_sync_logs")
        .insert({
          sync_type: syncType,
          status: "pending",
        })
        .select()
        .single();

      const { data, error } = await supabase.functions.invoke("zoho-sync", {
        body: { action: syncType, orgId },
      });

      if (error) throw error;

      // Update sync log
      if (logEntry) {
        await supabase
          .from("zoho_sync_logs")
          .update({
            status: data.success ? "success" : "failed",
            records_synced: data.synced || 0,
            records_failed: data.failed || 0,
            error_message: data.error || null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", logEntry.id);
      }

      if (data.success) {
        toast({
          title: "Sync Completed",
          description: `Synced ${data.synced || 0} records, ${data.failed || 0} failed`,
        });
      } else {
        throw new Error(data.error || "Sync failed");
      }

      fetchData();
    } catch (error: any) {
      toast({
        title: "Sync Error",
        description: error.message || "Failed to sync with Zoho",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleRetry = async (logId: string, syncType: string) => {
    await handleSync(syncType);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-success" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "pending":
        return <Clock className="w-4 h-4 text-warning" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-success/15 text-success">Success</Badge>;
      case "failed":
        return <Badge className="bg-destructive/15 text-destructive">Failed</Badge>;
      case "pending":
        return <Badge className="bg-warning/15 text-warning">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-heading flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Zoho Sync Status
          </CardTitle>
          <div className="flex items-center gap-2">
            {connectionStatus === "connected" && (
              <Badge className="bg-success/15 text-success">
                <Wifi className="w-3 h-3 mr-1" />
                Connected
              </Badge>
            )}
            {connectionStatus === "failed" && (
              <Badge className="bg-destructive/15 text-destructive">
                <WifiOff className="w-3 h-3 mr-1" />
                Disconnected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Integration Status */}
        <div className="p-4 bg-secondary/30 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium">Zoho Invoice Integration</p>
              <p className="text-sm text-muted-foreground">
                {integration?.is_enabled ? "Enabled" : "Not configured"}
              </p>
            </div>
            <Badge className={integration?.is_enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}>
              {integration?.is_enabled ? "Active" : "Inactive"}
            </Badge>
          </div>
          {integration?.last_sync_at && (
            <p className="text-xs text-muted-foreground">
              Last sync: {format(new Date(integration.last_sync_at), "PPp")}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !integration?.is_enabled}
          >
            {testing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Wifi className="w-4 h-4 mr-2" />
            )}
            Test Connection
          </Button>
          <Button
            onClick={() => handleSync("sync_all_invoices")}
            disabled={syncing || !integration?.is_enabled}
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync All Invoices
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSync("sync_customers")}
            disabled={syncing || !integration?.is_enabled}
          >
            Sync Customers
          </Button>
        </div>

        {/* Sync Logs */}
        <div>
          <h4 className="font-medium mb-3">Recent Sync Logs</h4>
          <ScrollArea className="h-64">
            {syncLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No sync logs available
              </div>
            ) : (
              <div className="space-y-2">
                {syncLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-secondary/20 rounded-lg border border-border/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(log.status)}
                        <span className="font-medium text-sm">{log.sync_type}</span>
                        {getStatusBadge(log.status)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.started_at), "MMM d, HH:mm")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex gap-4 text-muted-foreground">
                        <span className="text-success">✓ {log.records_synced} synced</span>
                        {log.records_failed > 0 && (
                          <span className="text-destructive">✗ {log.records_failed} failed</span>
                        )}
                      </div>
                      {log.status === "failed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRetry(log.id, log.sync_type)}
                          disabled={syncing}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Retry
                        </Button>
                      )}
                    </div>
                    {log.error_message && (
                      <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
                        {log.error_message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};

export default ZohoSyncPanel;
