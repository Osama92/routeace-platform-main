import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Edit, Eye, RotateCcw, Save, X, Variable } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";

interface EmailTemplate {
  id: string;
  template_type: string;
  template_name: string;
  subject_template: string;
  body_template: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const defaultTemplates: Record<string, { subject: string; body: string }> = {
  delivery_update: {
    subject: 'Shipment Update - {{dispatch_number}} | {{truck_number}} | {{pickup}} → {{delivery}}',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">Delivery Update</h1>
   </div>
   <div style="padding: 30px; background: #f7fafc;">
     <p>Dear {{customer_name}},</p>
     <p>Your shipment <strong>{{dispatch_number}}</strong> has been updated.</p>
     <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
       <p><strong>Status:</strong> {{status}}</p>
       <p><strong>Truck:</strong> {{truck_number}}</p>
       <p><strong>Route:</strong> {{pickup}} → {{delivery}}</p>
     </div>
     <p>Best regards,<br>RouteAce Logistics</p>
   </div>
 </div>`
  },
  sla_breach: {
    subject: 'SLA Breach Alert - {{dispatch_number}} | {{delay_hours}}h Delay',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #c53030 0%, #9b2c2c 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">⚠️ SLA Breach Alert</h1>
   </div>
   <div style="padding: 30px; background: #fff5f5;">
     <p><strong>Dispatch:</strong> {{dispatch_number}}</p>
     <p><strong>Breach Type:</strong> {{breach_type}}</p>
     <p><strong>Delay:</strong> {{delay_hours}} hours</p>
     <p><strong>Customer:</strong> {{customer_name}}</p>
     <p style="color: #c53030; font-weight: bold;">Immediate action required.</p>
   </div>
 </div>`
  },
  invoice_first_approval: {
    subject: 'Invoice {{invoice_number}} - First Approval Complete',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #2b6cb0 0%, #2c5282 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">First Approval Complete</h1>
   </div>
   <div style="padding: 30px; background: #ebf8ff;">
     <p>Invoice <strong>{{invoice_number}}</strong> has received first approval.</p>
     <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
       <p><strong>Customer:</strong> {{customer_name}}</p>
       <p><strong>Amount:</strong> {{amount}}</p>
     </div>
     <p>Awaiting second approval.</p>
   </div>
 </div>`
  },
  invoice_second_approval: {
    subject: 'Invoice {{invoice_number}} - Approved! ✓',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #276749 0%, #22543d 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">✓ Invoice Approved</h1>
   </div>
   <div style="padding: 30px; background: #f0fff4;">
     <p>Great news! Invoice <strong>{{invoice_number}}</strong> has been fully approved.</p>
     <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
       <p><strong>Customer:</strong> {{customer_name}}</p>
       <p><strong>Amount:</strong> {{amount}}</p>
     </div>
     <p>The invoice is now ready for processing.</p>
   </div>
 </div>`
  },
  invoice_rejected: {
    subject: 'Invoice {{invoice_number}} - Rejected',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #c53030 0%, #9b2c2c 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">Invoice Rejected</h1>
   </div>
   <div style="padding: 30px; background: #fff5f5;">
     <p>Invoice <strong>{{invoice_number}}</strong> has been rejected.</p>
     <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
       <p><strong>Customer:</strong> {{customer_name}}</p>
       <p><strong>Amount:</strong> {{amount}}</p>
       <p><strong>Reason:</strong> {{rejection_reason}}</p>
     </div>
     <p>Please review and resubmit.</p>
   </div>
 </div>`
  }
};

const sampleData: Record<string, Record<string, string>> = {
  delivery_update: {
    dispatch_number: 'DSP-20260118-0001',
    truck_number: 'ABC-123-XY',
    status: 'In Transit',
    customer_name: 'Sample Customer Ltd',
    pickup: 'Lagos Depot',
    delivery: 'Abuja Warehouse'
  },
  sla_breach: {
    dispatch_number: 'DSP-20260118-0002',
    breach_type: 'Delivery Delay',
    delay_hours: '4.5',
    customer_name: 'Sample Customer Ltd',
    expected_time: '2026-01-18 10:00',
    actual_time: '2026-01-18 14:30'
  },
  invoice_first_approval: {
    invoice_number: 'INV-20260118-0001',
    customer_name: 'Sample Customer Ltd',
    amount: '₦1,500,000.00',
    approver_name: 'John Admin'
  },
  invoice_second_approval: {
    invoice_number: 'INV-20260118-0001',
    customer_name: 'Sample Customer Ltd',
    amount: '₦1,500,000.00',
    approver_name: 'Jane Manager'
  },
  invoice_rejected: {
    invoice_number: 'INV-20260118-0001',
    customer_name: 'Sample Customer Ltd',
    amount: '₦1,500,000.00',
    rejection_reason: 'Missing supporting documents',
    approver_name: 'John Admin'
  }
};

export default function EmailTemplatesPage() {
  const { userRole } = useAuth();
  const { logChange } = useAuditLog();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    subject_template: '',
    body_template: ''
  });
  const [saving, setSaving] = useState(false);

  const isAdmin = userRole === 'admin';

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('template_name');
      
      if (error) throw error;
      
      // Parse variables from JSONB
      const parsed = (data || []).map(t => ({
        ...t,
        variables: Array.isArray(t.variables) ? t.variables : JSON.parse(t.variables as string || '[]')
      }));
      
      setTemplates(parsed);
    } catch (error: any) {
      toast.error('Failed to load templates: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setEditForm({
      subject_template: template.subject_template,
      body_template: template.body_template
    });
    setIsEditDialogOpen(true);
  };

  const handlePreview = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setIsPreviewDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedTemplate) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('email_templates')
        .update({
          subject_template: editForm.subject_template,
          body_template: editForm.body_template
        })
        .eq('id', selectedTemplate.id);
      
      if (error) throw error;
      
      await logChange({
        table_name: 'email_templates',
        action: 'update',
        record_id: selectedTemplate.id,
        old_data: { subject: selectedTemplate.subject_template },
        new_data: { subject: editForm.subject_template }
      });
      
      toast.success('Template saved successfully');
      setIsEditDialogOpen(false);
      fetchTemplates();
    } catch (error: any) {
      toast.error('Failed to save template: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (template: EmailTemplate) => {
    try {
      const { error } = await supabase
        .from('email_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id);
      
      if (error) throw error;
      
      toast.success(`Template ${!template.is_active ? 'activated' : 'deactivated'}`);
      fetchTemplates();
    } catch (error: any) {
      toast.error('Failed to update template: ' + error.message);
    }
  };

  const handleResetToDefault = async () => {
    if (!selectedTemplate) return;
    
    const defaults = defaultTemplates[selectedTemplate.template_type];
    if (defaults) {
      setEditForm({
        subject_template: defaults.subject,
        body_template: defaults.body
      });
      toast.info('Reset to default template');
    }
  };

  const insertVariable = (variable: string) => {
    setEditForm(prev => ({
      ...prev,
      body_template: prev.body_template + `{{${variable}}}`
    }));
  };

  const renderPreview = (template: EmailTemplate) => {
    let subject = template.subject_template;
    let body = template.body_template;
    
    const data = sampleData[template.template_type] || {};
    
    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    });
    
    return { subject, body };
  };

  const getTemplateTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      delivery_update: 'Delivery Updates',
      sla_breach: 'SLA Breaches',
      invoice_first_approval: 'Invoice First Approval',
      invoice_second_approval: 'Invoice Final Approval',
      invoice_rejected: 'Invoice Rejected'
    };
    return labels[type] || type;
  };

  const getTemplateTypeColor = (type: string) => {
    if (type.includes('sla') || type.includes('rejected')) return 'destructive';
    if (type.includes('approval')) return 'default';
    return 'secondary';
  };

  return (
    <DashboardLayout 
      title="Email Templates" 
      subtitle="Configure notification email templates for different events"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Notification Templates
          </CardTitle>
          <CardDescription>
            Customize the subject and body of automated email notifications. Use {'{{variable}}'} placeholders for dynamic content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.template_name}</TableCell>
                    <TableCell>
                      <Badge variant={getTemplateTypeColor(template.template_type)}>
                        {getTemplateTypeLabel(template.template_type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {template.subject_template}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={template.is_active}
                          onCheckedChange={() => handleToggleActive(template)}
                          disabled={!isAdmin}
                        />
                        <span className={template.is_active ? 'text-green-600' : 'text-muted-foreground'}>
                          {template.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handlePreview(template)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEdit(template)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Template Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template: {selectedTemplate?.template_name}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Available Variables</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedTemplate?.variables.map((variable) => (
                  <Badge
                    key={variable}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                    onClick={() => insertVariable(variable)}
                  >
                    <Variable className="h-3 w-3 mr-1" />
                    {variable}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="subject">Subject Template</Label>
              <Input
                id="subject"
                value={editForm.subject_template}
                onChange={(e) => setEditForm({ ...editForm, subject_template: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="body">Body Template (HTML)</Label>
              <Textarea
                id="body"
                value={editForm.body_template}
                onChange={(e) => setEditForm({ ...editForm, body_template: e.target.value })}
                className="mt-1 min-h-[300px] font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            <Button variant="outline" onClick={handleResetToDefault}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Default
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Template'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {selectedTemplate?.template_name}</DialogTitle>
          </DialogHeader>
          
          {selectedTemplate && (
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Subject</Label>
                <div className="mt-1 p-3 bg-muted rounded-md font-medium">
                  {renderPreview(selectedTemplate).subject}
                </div>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Email Body</Label>
                <div 
                  className="mt-1 border rounded-md overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: renderPreview(selectedTemplate).body }}
                />
              </div>
              
              <div className="text-sm text-muted-foreground">
                <p>This is a preview using sample data. Actual emails will use real dispatch/invoice data.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
