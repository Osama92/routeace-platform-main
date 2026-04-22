import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2 } from "lucide-react";

const OrganizationSetup = () => {
  const { user, refreshApprovalStatus } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !companyName.trim()) return;

    setSaving(true);
    try {
      const slug = companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const uniqueSlug = `${slug}-${Date.now().toString(36)}`;

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({ name: companyName.trim(), slug: uniqueSlug })
        .select()
        .single();

      if (orgError) throw orgError;

      const { error: memberError } = await supabase
        .from("org_members")
        .insert({ user_id: user.id, org_id: org.id, role: "admin", is_active: true });

      if (memberError) throw memberError;

      toast({ title: "Organization created", description: `Welcome to ${companyName}!` });
      // Reload so AuthContext picks up the new org membership
      window.location.href = "/";
    } catch (err: any) {
      toast({ title: "Failed to create organization", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-card p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-heading font-bold">Set Up Your Organization</h1>
          <p className="text-muted-foreground text-sm">
            Create your company workspace to get started with RouteAce.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input
              id="company-name"
              placeholder="e.g. Acme Logistics Ltd"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full" disabled={saving || !companyName.trim()}>
            {saving ? "Creating..." : "Create Organization"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default OrganizationSetup;
