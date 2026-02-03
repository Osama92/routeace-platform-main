import { supabase } from "@/integrations/supabase/client";

export type SyncDataType = 'dispatches' | 'customers' | 'drivers' | 'vehicles' | 'invoices' | 'expenses' | 'transactions';

export interface SheetConfig {
  spreadsheet_id: string;
  sheet_name: string;
  data_type: SyncDataType;
}

export interface SyncResult {
  success: boolean;
  exported?: number;
  imported?: number;
  skipped?: number;
  errors?: string[];
  message?: string;
  error?: string;
}

class GoogleSheetsService {
  private async callEdgeFunction(action: string, config: SheetConfig): Promise<SyncResult> {
    const { data, error } = await supabase.functions.invoke('google-sheets-sync', {
      body: { action, config },
    });

    if (error) {
      throw new Error(error.message || 'Failed to call Google Sheets sync function');
    }

    return data as SyncResult;
  }

  async testConnection(spreadsheetId: string, sheetName: string = 'Sheet1'): Promise<SyncResult> {
    return this.callEdgeFunction('test_connection', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'dispatches',
    });
  }

  async exportDispatches(spreadsheetId: string, sheetName: string = 'Dispatches'): Promise<SyncResult> {
    return this.callEdgeFunction('export_dispatches', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'dispatches',
    });
  }

  async exportCustomers(spreadsheetId: string, sheetName: string = 'Customers'): Promise<SyncResult> {
    return this.callEdgeFunction('export_customers', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'customers',
    });
  }

  async exportDrivers(spreadsheetId: string, sheetName: string = 'Drivers'): Promise<SyncResult> {
    return this.callEdgeFunction('export_drivers', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'drivers',
    });
  }

  async exportVehicles(spreadsheetId: string, sheetName: string = 'Vehicles'): Promise<SyncResult> {
    return this.callEdgeFunction('export_vehicles', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'vehicles',
    });
  }

  async exportInvoices(spreadsheetId: string, sheetName: string = 'Invoices'): Promise<SyncResult> {
    return this.callEdgeFunction('export_invoices', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'invoices',
    });
  }

  async exportExpenses(spreadsheetId: string, sheetName: string = 'Expenses'): Promise<SyncResult> {
    return this.callEdgeFunction('export_expenses', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'expenses',
    });
  }

  async importCustomers(spreadsheetId: string, sheetName: string = 'Customers'): Promise<SyncResult> {
    return this.callEdgeFunction('import_customers', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'customers',
    });
  }

  async importDrivers(spreadsheetId: string, sheetName: string = 'Drivers'): Promise<SyncResult> {
    return this.callEdgeFunction('import_drivers', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'drivers',
    });
  }

  async importVehicles(spreadsheetId: string, sheetName: string = 'Vehicles'): Promise<SyncResult> {
    return this.callEdgeFunction('import_vehicles', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'vehicles',
    });
  }

  // Export transactions (historical invoice data with all 50+ fields)
  async exportTransactions(spreadsheetId: string, sheetName: string = 'All Month breakdown All Biz'): Promise<SyncResult> {
    return this.callEdgeFunction('export_transactions', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'transactions',
    });
  }

  // Import transactions from Google Sheets (historical invoice data with all 50+ fields)
  async importTransactions(spreadsheetId: string, sheetName: string = 'All Month breakdown All Biz'): Promise<SyncResult> {
    return this.callEdgeFunction('import_transactions', {
      spreadsheet_id: spreadsheetId,
      sheet_name: sheetName,
      data_type: 'transactions',
    });
  }

  // Append a single transaction to Google Sheets (auto-sync when new transaction created)
  async appendTransaction(
    spreadsheetId: string,
    transactionId: string,
    sheetName: string = 'All Month breakdown All Biz'
  ): Promise<SyncResult> {
    const { data, error } = await supabase.functions.invoke('google-sheets-sync', {
      body: {
        action: 'append_transaction',
        config: {
          spreadsheet_id: spreadsheetId,
          sheet_name: sheetName,
          data_type: 'transactions',
          transaction_id: transactionId,
        }
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to append transaction to Google Sheets');
    }

    return data as SyncResult;
  }

  // Sync all data types (export)
  async exportAll(spreadsheetId: string): Promise<{ [key: string]: SyncResult }> {
    const results: { [key: string]: SyncResult } = {};

    results.dispatches = await this.exportDispatches(spreadsheetId);
    results.customers = await this.exportCustomers(spreadsheetId);
    results.drivers = await this.exportDrivers(spreadsheetId);
    results.vehicles = await this.exportVehicles(spreadsheetId);
    results.invoices = await this.exportInvoices(spreadsheetId);
    results.expenses = await this.exportExpenses(spreadsheetId);

    return results;
  }

  // Extract spreadsheet ID from URL
  static extractSpreadsheetId(url: string): string | null {
    // Handle various Google Sheets URL formats
    const patterns = [
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
      /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
      /^([a-zA-Z0-9-_]{44})$/, // Direct ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }
}

export const googleSheetsService = new GoogleSheetsService();
