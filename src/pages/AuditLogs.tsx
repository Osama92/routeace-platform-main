import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Filter, Clock, User, FileText, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: any;
  new_data: any;
  user_id: string | null;
  user_email: string | null;
  created_at: string;
}

const actionColors: Record<string, string> = {
  insert: "bg-success/15 text-success",
  update: "bg-warning/15 text-warning",
  delete: "bg-destructive/15 text-destructive",
};

const AuditLogsPage = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [tables, setTables] = useState<string[]>([]);

  const fetchLogs = async () => {
    try {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (tableFilter !== "all") {
        query = query.eq("table_name", tableFilter);
      }
      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      setLogs(data || []);
      
      // Extract unique table names
      const uniqueTables = [...new Set((data || []).map(l => l.table_name))];
      setTables(uniqueTables);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [tableFilter, actionFilter]);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.table_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.record_id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const formatDiff = (oldData: any, newData: any) => {
    if (!oldData && newData) return { changes: Object.keys(newData), type: "created" };
    if (oldData && !newData) return { changes: Object.keys(oldData), type: "deleted" };
    
    const changes: string[] = [];
    const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
    
    allKeys.forEach(key => {
      if (JSON.stringify(oldData?.[key]) !== JSON.stringify(newData?.[key])) {
        changes.push(key);
      }
    });
    
    return { changes, type: "modified" };
  };

  return (
    <DashboardLayout
      title="Audit Logs"
      subtitle="Track all system changes with user signatures and timestamps"
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Logs", value: logs.length, icon: FileText },
          { label: "Inserts", value: logs.filter(l => l.action === "insert").length, icon: Clock },
          { label: "Updates", value: logs.filter(l => l.action === "update").length, icon: Clock },
          { label: "Deletes", value: logs.filter(l => l.action === "delete").length, icon: Clock },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="glass-card p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <stat.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <div className="flex gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by table, user, or record ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-border/50"
            />
          </div>
          <Select value={tableFilter} onValueChange={setTableFilter}>
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Table" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tables</SelectItem>
              {tables.map(table => (
                <SelectItem key={table} value={table}>{table}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-32 bg-secondary/50 border-border/50">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="insert">Insert</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Logs Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Record ID</TableHead>
              <TableHead>Changes</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No audit logs found
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => {
                const diff = formatDiff(log.old_data, log.new_data);
                return (
                  <TableRow key={log.id} className="border-border/50">
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{format(new Date(log.created_at), "MMM dd, yyyy")}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(log.created_at), "HH:mm:ss")}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm truncate max-w-[150px]">{log.user_email || "System"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.table_name}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={actionColors[log.action] || ""}>{log.action}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[120px]">
                      {log.record_id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {diff.changes.length} field{diff.changes.length !== 1 ? "s" : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </motion.div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Audit Log Details</DialogTitle>
            <DialogDescription>
              Full details of the {selectedLog?.action} operation
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/30 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Timestamp</p>
                  <p className="font-medium">{format(new Date(selectedLog.created_at), "PPpp")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">User</p>
                  <p className="font-medium">{selectedLog.user_email || "System"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Table</p>
                  <p className="font-medium">{selectedLog.table_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Record ID</p>
                  <p className="font-mono text-sm">{selectedLog.record_id}</p>
                </div>
              </div>

              {selectedLog.old_data && (
                <div>
                  <h4 className="font-semibold mb-2">Previous Data</h4>
                  <pre className="p-4 bg-destructive/10 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.old_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_data && (
                <div>
                  <h4 className="font-semibold mb-2">New Data</h4>
                  <pre className="p-4 bg-success/10 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.new_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AuditLogsPage;
