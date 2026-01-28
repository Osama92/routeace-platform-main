import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileSpreadsheet,
  Upload,
  Download,
  RefreshCw,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  Save,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { googleSheetsService, SyncDataType } from "@/services/googleSheetsService";
import { supabase } from "@/integrations/supabase/client";

interface SyncStatus {
  type: SyncDataType;
  status: "idle" | "syncing" | "success" | "error";
  message?: string;
  count?: number;
}

interface SavedConfig {
  id: string;
  spreadsheet_id: string;
  spreadsheet_url: string | null;
  name: string;
  is_active: boolean;
  last_sync_at: string | null;
}

const GoogleSheetsIntegration = () => {
  const { toast } = useToast();
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "connected" | "error">("idle");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedConfig, setSavedConfig] = useState<SavedConfig | null>(null);
  const [syncStatuses, setSyncStatuses] = useState<Record<SyncDataType, SyncStatus>>({
    dispatches: { type: "dispatches", status: "idle" },
    customers: { type: "customers", status: "idle" },
    drivers: { type: "drivers", status: "idle" },
    vehicles: { type: "vehicles", status: "idle" },
    invoices: { type: "invoices", status: "idle" },
    expenses: { type: "expenses", status: "idle" },
  });
  const [selectedExportType, setSelectedExportType] = useState<SyncDataType>("dispatches");
  const [selectedImportType, setSelectedImportType] = useState<SyncDataType>("customers");

  // Load saved configuration on mount
  useEffect(() => {
    loadSavedConfig();
  }, []);

  const loadSavedConfig = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("google_sheets_configs")
        .select("id, spreadsheet_id, spreadsheet_url, name, is_active, last_sync_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found, which is fine
        console.error("Error loading config:", error);
      }

      if (data) {
        setSavedConfig(data);
        setSpreadsheetId(data.spreadsheet_id);
        setSpreadsheetUrl(data.spreadsheet_url || `https://docs.google.com/spreadsheets/d/${data.spreadsheet_id}`);
        setConnectionStatus("connected");
      }
    } catch (error) {
      console.error("Error loading saved config:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUrlChange = (url: string) => {
    setSpreadsheetUrl(url);
    const extractedId = extractSpreadsheetId(url);
    if (extractedId) {
      setSpreadsheetId(extractedId);
    } else {
      setSpreadsheetId("");
    }
    // Reset connection status when URL changes
    if (savedConfig?.spreadsheet_id !== extractedId) {
      setConnectionStatus("idle");
    }
  };

  const extractSpreadsheetId = (url: string): string | null => {
    const patterns = [
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
      /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
      /^([a-zA-Z0-9-_]{44})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  };

  const testConnection = async () => {
    if (!spreadsheetId) {
      toast({
        title: "Missing Spreadsheet",
        description: "Please enter a valid Google Sheets URL or ID",
        variant: "destructive",
      });
      return;
    }

    setConnectionStatus("testing");
    try {
      const result = await googleSheetsService.testConnection(spreadsheetId);
      if (result.success) {
        setConnectionStatus("connected");
        toast({
          title: "Connected",
          description: "Successfully connected to Google Sheets",
        });
      } else {
        throw new Error(result.error || "Connection failed");
      }
    } catch (error: any) {
      setConnectionStatus("error");
      toast({
        title: "Connection Failed",
        description: error.message || "Could not connect to Google Sheets",
        variant: "destructive",
      });
    }
  };

  const saveConfiguration = async () => {
    if (!spreadsheetId || connectionStatus !== "connected") {
      toast({
        title: "Cannot Save",
        description: "Please connect to a Google Sheet first",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Deactivate any existing configs first
      if (savedConfig?.id) {
        await supabase
          .from("google_sheets_configs")
          .update({ is_active: false })
          .neq("id", savedConfig.id);
      }

      const configData = {
        name: "Default Google Sheets Connection",
        spreadsheet_id: spreadsheetId,
        spreadsheet_url: spreadsheetUrl,
        data_type: "dispatches" as const,
        sheet_name: "Sheet1",
        sync_direction: "both" as const,
        is_active: true,
      };

      if (savedConfig?.id) {
        // Update existing config
        const { error } = await supabase
          .from("google_sheets_configs")
          .update(configData)
          .eq("id", savedConfig.id);

        if (error) throw error;
      } else {
        // Insert new config
        const { data, error } = await supabase
          .from("google_sheets_configs")
          .insert(configData)
          .select()
          .single();

        if (error) throw error;
        setSavedConfig(data);
      }

      toast({
        title: "Configuration Saved",
        description: "Your Google Sheets connection has been saved",
      });
    } catch (error: any) {
      console.error("Error saving config:", error);
      toast({
        title: "Save Failed",
        description: error.message || "Could not save configuration",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const disconnectSheet = async () => {
    try {
      if (savedConfig?.id) {
        await supabase
          .from("google_sheets_configs")
          .update({ is_active: false })
          .eq("id", savedConfig.id);
      }

      setSavedConfig(null);
      setSpreadsheetUrl("");
      setSpreadsheetId("");
      setConnectionStatus("idle");

      toast({
        title: "Disconnected",
        description: "Google Sheets connection has been removed",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Could not disconnect",
        variant: "destructive",
      });
    }
  };

  const handleExport = async (dataType: SyncDataType) => {
    if (!spreadsheetId) {
      toast({
        title: "No Spreadsheet",
        description: "Please connect to a Google Sheet first",
        variant: "destructive",
      });
      return;
    }

    setSyncStatuses(prev => ({
      ...prev,
      [dataType]: { ...prev[dataType], status: "syncing" },
    }));

    try {
      let result;
      const sheetName = dataType.charAt(0).toUpperCase() + dataType.slice(1);

      switch (dataType) {
        case "dispatches":
          result = await googleSheetsService.exportDispatches(spreadsheetId, sheetName);
          break;
        case "customers":
          result = await googleSheetsService.exportCustomers(spreadsheetId, sheetName);
          break;
        case "drivers":
          result = await googleSheetsService.exportDrivers(spreadsheetId, sheetName);
          break;
        case "vehicles":
          result = await googleSheetsService.exportVehicles(spreadsheetId, sheetName);
          break;
        case "invoices":
          result = await googleSheetsService.exportInvoices(spreadsheetId, sheetName);
          break;
        case "expenses":
          result = await googleSheetsService.exportExpenses(spreadsheetId, sheetName);
          break;
      }

      if (result?.success) {
        setSyncStatuses(prev => ({
          ...prev,
          [dataType]: {
            ...prev[dataType],
            status: "success",
            count: result.exported,
            message: `Exported ${result.exported} records`,
          },
        }));

        // Update last sync time
        if (savedConfig?.id) {
          await supabase
            .from("google_sheets_configs")
            .update({ last_sync_at: new Date().toISOString() })
            .eq("id", savedConfig.id);
        }

        toast({
          title: "Export Successful",
          description: `Exported ${result.exported} ${dataType} to Google Sheets`,
        });
      } else {
        throw new Error(result?.error || "Export failed");
      }
    } catch (error: any) {
      setSyncStatuses(prev => ({
        ...prev,
        [dataType]: {
          ...prev[dataType],
          status: "error",
          message: error.message,
        },
      }));
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleImport = async (dataType: SyncDataType) => {
    if (!spreadsheetId) {
      toast({
        title: "No Spreadsheet",
        description: "Please connect to a Google Sheet first",
        variant: "destructive",
      });
      return;
    }

    setSyncStatuses(prev => ({
      ...prev,
      [dataType]: { ...prev[dataType], status: "syncing" },
    }));

    try {
      let result;
      const sheetName = dataType.charAt(0).toUpperCase() + dataType.slice(1);

      switch (dataType) {
        case "customers":
          result = await googleSheetsService.importCustomers(spreadsheetId, sheetName);
          break;
        case "drivers":
          result = await googleSheetsService.importDrivers(spreadsheetId, sheetName);
          break;
        case "vehicles":
          result = await googleSheetsService.importVehicles(spreadsheetId, sheetName);
          break;
        default:
          throw new Error(`Import not supported for ${dataType}`);
      }

      if (result?.success) {
        setSyncStatuses(prev => ({
          ...prev,
          [dataType]: {
            ...prev[dataType],
            status: "success",
            count: result.imported,
            message: `Imported ${result.imported}, skipped ${result.skipped || 0}`,
          },
        }));
        toast({
          title: "Import Successful",
          description: `Imported ${result.imported} ${dataType} from Google Sheets`,
        });
      } else {
        throw new Error(result?.error || "Import failed");
      }
    } catch (error: any) {
      setSyncStatuses(prev => ({
        ...prev,
        [dataType]: {
          ...prev[dataType],
          status: "error",
          message: error.message,
        },
      }));
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleExportAll = async () => {
    if (!spreadsheetId) {
      toast({
        title: "No Spreadsheet",
        description: "Please connect to a Google Sheet first",
        variant: "destructive",
      });
      return;
    }

    const dataTypes: SyncDataType[] = ["dispatches", "customers", "drivers", "vehicles", "invoices", "expenses"];

    for (const type of dataTypes) {
      await handleExport(type);
    }
  };

  const getStatusIcon = (status: SyncStatus["status"]) => {
    switch (status) {
      case "syncing":
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case "success":
        return <Check className="w-4 h-4 text-success" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Google Sheets</CardTitle>
              <CardDescription>Two-way sync with Google Sheets</CardDescription>
            </div>
          </div>
          {connectionStatus === "connected" && (
            <Check className="w-5 h-5 text-success" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Setup */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="spreadsheet_url">Google Sheets URL or ID</Label>
            <div className="flex gap-2">
              <Input
                id="spreadsheet_url"
                value={spreadsheetUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="bg-secondary/50 flex-1"
              />
              <Button
                onClick={testConnection}
                disabled={connectionStatus === "testing" || !spreadsheetId}
                variant="outline"
                title="Test Connection"
              >
                {connectionStatus === "testing" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>
            {spreadsheetId && (
              <p className="text-xs text-muted-foreground">
                Spreadsheet ID: {spreadsheetId.slice(0, 20)}...
              </p>
            )}
          </div>

          {connectionStatus === "connected" && (
            <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm text-success flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Connected to Google Sheets
                  {savedConfig && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (Saved)
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  {!savedConfig && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={saveConfiguration}
                      disabled={isSaving}
                      className="h-7 text-xs"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Save className="w-3 h-3 mr-1" />
                      )}
                      Save
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={disconnectSheet}
                    className="h-7 text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Disconnect
                  </Button>
                </div>
              </div>
              {savedConfig?.last_sync_at && (
                <p className="text-xs text-muted-foreground mt-2">
                  Last synced: {new Date(savedConfig.last_sync_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {connectionStatus === "error" && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Connection failed. Check your credentials and spreadsheet permissions.
              </p>
            </div>
          )}
        </div>

        {/* Export Section */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export to Google Sheets
          </h4>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={selectedExportType} onValueChange={(v) => setSelectedExportType(v as SyncDataType)}>
              <SelectTrigger className="bg-secondary/50 sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dispatches">Dispatches</SelectItem>
                <SelectItem value="customers">Customers</SelectItem>
                <SelectItem value="drivers">Drivers</SelectItem>
                <SelectItem value="vehicles">Vehicles</SelectItem>
                <SelectItem value="invoices">Invoices</SelectItem>
                <SelectItem value="expenses">Expenses</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => handleExport(selectedExportType)}
              disabled={connectionStatus !== "connected" || syncStatuses[selectedExportType].status === "syncing"}
              className="flex-1 sm:flex-initial"
            >
              {syncStatuses[selectedExportType].status === "syncing" ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export {selectedExportType}
            </Button>
            <Button
              variant="outline"
              onClick={handleExportAll}
              disabled={connectionStatus !== "connected"}
            >
              Export All
            </Button>
          </div>
          {syncStatuses[selectedExportType].status !== "idle" && (
            <div className="flex items-center gap-2 text-sm">
              {getStatusIcon(syncStatuses[selectedExportType].status)}
              <span className="text-muted-foreground">
                {syncStatuses[selectedExportType].message}
              </span>
            </div>
          )}
        </div>

        {/* Import Section */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import from Google Sheets
          </h4>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={selectedImportType} onValueChange={(v) => setSelectedImportType(v as SyncDataType)}>
              <SelectTrigger className="bg-secondary/50 sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customers">Customers</SelectItem>
                <SelectItem value="drivers">Drivers</SelectItem>
                <SelectItem value="vehicles">Vehicles</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => handleImport(selectedImportType)}
              disabled={connectionStatus !== "connected" || syncStatuses[selectedImportType].status === "syncing"}
              variant="outline"
              className="flex-1 sm:flex-initial"
            >
              {syncStatuses[selectedImportType].status === "syncing" ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Import {selectedImportType}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Import will update existing records or create new ones based on matching fields.
          </p>
        </div>

        {/* Setup Instructions */}
        <div className="pt-4 border-t border-border/50">
          <h4 className="font-medium text-sm mb-2">Setup Instructions</h4>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Create a new Google Sheet or use an existing one</li>
            <li>Paste the sheet URL above and test the connection</li>
            <li>Click "Save" to remember this connection</li>
            <li>Each data type will be exported to its own tab (e.g., "Dispatches", "Customers")</li>
          </ol>
          <div className="flex flex-wrap gap-2 mt-3">
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
              Google Cloud Console <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-xs text-muted-foreground">|</span>
            <a
              href="https://developers.google.com/sheets/api/quickstart/js"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
              API Documentation <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default GoogleSheetsIntegration;
