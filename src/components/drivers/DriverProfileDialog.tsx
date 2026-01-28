import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Phone, Mail, Star, Truck, Calendar, FileText, MapPin, Edit, Save, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuditLog } from "@/hooks/useAuditLog";
import { format, differenceInDays } from "date-fns";
import DriverSalarySection from "./DriverSalarySection";

interface Driver {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  license_number: string | null;
  license_expiry: string | null;
  status: string | null;
  rating: number | null;
  total_trips: number | null;
  documents_verified: boolean | null;
  driver_type?: string | null;
  salary_type?: string | null;
  base_salary?: number | null;
  tax_id?: string | null;
}

interface DriverDocument {
  id: string;
  document_type: string;
  document_name: string;
  expiry_date: string | null;
  is_verified: boolean | null;
}

interface RecentTrip {
  id: string;
  dispatch_number: string;
  pickup_address: string;
  delivery_address: string;
  status: string;
  created_at: string;
}

interface DriverProfileDialogProps {
  driver: Driver | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

const DriverProfileDialog = ({ driver, open, onOpenChange, onUpdate }: DriverProfileDialogProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    license_number: "",
    license_expiry: "",
    driver_type: "owned" as "owned" | "third_party",
    salary_type: "monthly" as "per_trip" | "bi_monthly" | "monthly",
    base_salary: 0,
    tax_id: "",
  });
  const { toast } = useToast();
  const { logChange } = useAuditLog();

  useEffect(() => {
    if (driver && open) {
      setFormData({
        full_name: driver.full_name,
        email: driver.email || "",
        phone: driver.phone,
        license_number: driver.license_number || "",
        license_expiry: driver.license_expiry || "",
        driver_type: (driver.driver_type as "owned" | "third_party") || "owned",
        salary_type: (driver.salary_type as "per_trip" | "bi_monthly" | "monthly") || "monthly",
        base_salary: driver.base_salary || 0,
        tax_id: driver.tax_id || "",
      });
      fetchDriverData(driver.id);
    }
  }, [driver, open]);

  const fetchDriverData = async (driverId: string) => {
    // Fetch documents
    const { data: docs } = await supabase
      .from("driver_documents")
      .select("*")
      .eq("driver_id", driverId)
      .order("expiry_date", { ascending: true });
    setDocuments(docs || []);

    // Fetch recent trips
    const { data: trips } = await supabase
      .from("dispatches")
      .select("id, dispatch_number, pickup_address, delivery_address, status, created_at")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(10);
    setRecentTrips(trips || []);
  };

  const handleSave = async () => {
    if (!driver) return;

    setSaving(true);
    try {
      const updateData = {
        full_name: formData.full_name,
        email: formData.email || null,
        phone: formData.phone,
        license_number: formData.license_number || null,
        license_expiry: formData.license_expiry || null,
        driver_type: formData.driver_type,
        salary_type: formData.salary_type,
        base_salary: formData.base_salary,
        tax_id: formData.tax_id || null,
      };

      const { error } = await supabase
        .from("drivers")
        .update(updateData)
        .eq("id", driver.id);

      if (error) throw error;

      // Log the update
      await logChange({
        table_name: "drivers",
        record_id: driver.id,
        action: "update",
        old_data: {
          full_name: driver.full_name,
          email: driver.email,
          phone: driver.phone,
          license_number: driver.license_number,
          license_expiry: driver.license_expiry,
          driver_type: driver.driver_type,
          salary_type: driver.salary_type,
          base_salary: driver.base_salary,
          tax_id: driver.tax_id,
        },
        new_data: updateData,
      });

      toast({
        title: "Success",
        description: "Driver profile updated successfully",
      });
      setIsEditing(false);
      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!driver) return null;

  const initials = driver.full_name.split(" ").map((n) => n[0]).join("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-3">
            <Avatar className="w-12 h-12">
              <AvatarImage src="/placeholder.svg" />
              <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <span>{driver.full_name}</span>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={driver.status === "available" ? "default" : "secondary"}>
                  {driver.status || "available"}
                </Badge>
                <div className="flex items-center gap-1 text-sm">
                  <Star className="w-4 h-4 text-warning fill-warning" />
                  <span>{driver.rating?.toFixed(1) || "5.0"}</span>
                </div>
              </div>
            </div>
          </DialogTitle>
          <DialogDescription>
            View and manage driver information
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="salary">
              <DollarSign className="w-3 h-3 mr-1" />
              Salary
            </TabsTrigger>
            <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
            <TabsTrigger value="trips">Trips ({recentTrips.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            {isEditing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    value={formData.full_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
                    className="bg-secondary/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                      className="bg-secondary/50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>License Number</Label>
                    <Input
                      value={formData.license_number}
                      onChange={(e) => setFormData((prev) => ({ ...prev, license_number: e.target.value }))}
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>License Expiry</Label>
                    <Input
                      type="date"
                      value={formData.license_expiry}
                      onChange={(e) => setFormData((prev) => ({ ...prev, license_expiry: e.target.value }))}
                      className="bg-secondary/50"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Email</span>
                    </div>
                    <p className="font-medium">{driver.email || "Not provided"}</p>
                  </div>
                  <div className="p-4 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Phone</span>
                    </div>
                    <p className="font-medium">{driver.phone}</p>
                  </div>
                  <div className="p-4 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">License Number</span>
                    </div>
                    <p className="font-medium">{driver.license_number || "Not provided"}</p>
                  </div>
                  <div className="p-4 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">License Expiry</span>
                    </div>
                    <p className="font-medium">
                      {driver.license_expiry 
                        ? format(new Date(driver.license_expiry), "dd MMM yyyy")
                        : "Not provided"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-primary/10 rounded-lg text-center">
                    <Truck className="w-8 h-8 text-primary mx-auto mb-2" />
                    <p className="text-2xl font-bold">{driver.total_trips || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Trips</p>
                  </div>
                  <div className="p-4 bg-warning/10 rounded-lg text-center">
                    <Star className="w-8 h-8 text-warning mx-auto mb-2" />
                    <p className="text-2xl font-bold">{driver.rating?.toFixed(1) || "5.0"}</p>
                    <p className="text-sm text-muted-foreground">Rating</p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="salary" className="mt-4">
            <DriverSalarySection
              data={{
                driver_type: formData.driver_type,
                salary_type: formData.salary_type,
                base_salary: formData.base_salary,
                tax_id: formData.tax_id,
              }}
              onChange={(salaryData) => setFormData(prev => ({ 
                ...prev, 
                driver_type: salaryData.driver_type,
                salary_type: salaryData.salary_type,
                base_salary: salaryData.base_salary,
                tax_id: salaryData.tax_id || "",
              }))}
              isEditing={isEditing}
            />
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            {documents.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No documents uploaded</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => {
                    const daysUntilExpiry = doc.expiry_date 
                      ? differenceInDays(new Date(doc.expiry_date), new Date())
                      : null;
                    const isExpiring = daysUntilExpiry !== null && daysUntilExpiry <= 30;
                    const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;

                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.document_name}</TableCell>
                        <TableCell className="capitalize">{doc.document_type.replace("_", " ")}</TableCell>
                        <TableCell>
                          {doc.expiry_date ? (
                            <span className={isExpired ? "text-destructive" : isExpiring ? "text-warning" : ""}>
                              {format(new Date(doc.expiry_date), "dd MMM yyyy")}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={doc.is_verified ? "default" : "secondary"}>
                            {doc.is_verified ? "Verified" : "Pending"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="trips" className="mt-4">
            {recentTrips.length === 0 ? (
              <div className="text-center py-8">
                <MapPin className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No trips completed yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentTrips.map((trip) => (
                  <div key={trip.id} className="p-3 bg-secondary/30 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{trip.dispatch_number}</span>
                      <Badge variant={trip.status === "delivered" ? "default" : "secondary"}>
                        {trip.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {trip.pickup_address.split(",")[0]} → {trip.delivery_address.split(",")[0]}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(trip.created_at), "dd MMM yyyy")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => setIsEditing(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Profile
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DriverProfileDialog;
