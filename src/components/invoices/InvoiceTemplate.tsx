import { forwardRef } from "react";

interface LineItem {
  id: string;
  type: string;
  description: string;
  quantity: number;
  price: number;
  location?: string;
}

interface CompanyProfile {
  company_name: string;
  company_tagline?: string;
  company_email: string;
  company_phone: string;
  company_address: string;
  company_logo?: string;
  authorized_signature?: string;
  tin_number?: string;
  website?: string;
}

interface BankDetails {
  bank_name: string;
  account_name: string;
  account_number: string;
}

interface InvoiceTemplateProps {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  terms?: string;
  customerName: string;
  customerAddress?: string;
  lineItems: LineItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  taxType: "none" | "inclusive" | "exclusive";
  shippingCharge?: number;
  notes?: string;
  companyProfile: CompanyProfile | null;
  bankDetails: BankDetails | null;
  balanceDue?: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const InvoiceTemplate = forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  (
    {
      invoiceNumber,
      invoiceDate,
      dueDate,
      terms = "Due on Receipt",
      customerName,
      customerAddress,
      lineItems,
      subtotal,
      vatAmount,
      total,
      taxType,
      shippingCharge = 0,
      notes,
      companyProfile,
      bankDetails,
      balanceDue,
    },
    ref
  ) => {
    const displayBalanceDue = balanceDue ?? total;

    return (
      <div
        ref={ref}
        className="bg-white text-gray-900 p-8 max-w-[800px] mx-auto font-sans"
        style={{ fontFamily: "Arial, sans-serif" }}
      >
        {/* Header Section */}
        <div className="flex justify-between items-start mb-8">
          {/* Company Logo */}
          <div className="flex-shrink-0">
            {companyProfile?.company_logo ? (
              <img
                src={companyProfile.company_logo}
                alt="Company Logo"
                className="max-w-[180px] max-h-[100px] object-contain"
              />
            ) : (
              <div className="w-[120px] h-[80px] bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-2xl font-bold">
                  {companyProfile?.company_name?.charAt(0) || "C"}
                </span>
              </div>
            )}
          </div>

          {/* Invoice Title and Balance */}
          <div className="text-right">
            <h1 className="text-4xl font-light text-gray-700 mb-1">Invoice</h1>
            <p className="text-gray-500 text-sm"># {invoiceNumber}</p>
            <div className="mt-4">
              <p className="text-xs text-gray-500 uppercase">Balance Due</p>
              <p className="text-2xl font-semibold text-gray-900">
                NGN{formatCurrency(displayBalanceDue)}
              </p>
            </div>
          </div>
        </div>

        {/* Company Details */}
        <div className="mb-8">
          <p className="font-semibold text-gray-900">
            {companyProfile?.company_name || "Your Company Name"}
          </p>
          {companyProfile?.company_address && (
            <p className="text-sm text-gray-600 whitespace-pre-line">
              {companyProfile.company_address}
            </p>
          )}
          {companyProfile?.company_phone && (
            <p className="text-sm text-gray-600">{companyProfile.company_phone}</p>
          )}
          {companyProfile?.company_email && (
            <p className="text-sm text-gray-600">{companyProfile.company_email}</p>
          )}
          {companyProfile?.website && (
            <p className="text-sm text-gray-600">{companyProfile.website}</p>
          )}
        </div>

        {/* Bill To and Invoice Info */}
        <div className="flex justify-between mb-8">
          {/* Bill To */}
          <div>
            <p className="font-semibold text-gray-900 mb-2">{customerName}</p>
            {customerAddress && (
              <p className="text-sm text-gray-600 whitespace-pre-line max-w-[300px]">
                {customerAddress}
              </p>
            )}
          </div>

          {/* Invoice Details */}
          <div className="text-right">
            <table className="ml-auto">
              <tbody className="text-sm">
                <tr>
                  <td className="text-gray-500 pr-4 py-1">Invoice Date :</td>
                  <td className="text-gray-900 text-right">{formatDate(invoiceDate)}</td>
                </tr>
                <tr>
                  <td className="text-gray-500 pr-4 py-1">Terms :</td>
                  <td className="text-gray-900 text-right">{terms}</td>
                </tr>
                <tr>
                  <td className="text-gray-500 pr-4 py-1">Due Date :</td>
                  <td className="text-gray-900 text-right">{formatDate(dueDate)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-6">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-t border-b border-gray-300 bg-gray-50">
                <th className="text-left py-3 px-3 text-gray-600 font-medium text-sm w-12">
                  #
                </th>
                <th className="text-left py-3 px-3 text-gray-600 font-medium text-sm">
                  Description
                </th>
                <th className="text-center py-3 px-3 text-gray-600 font-medium text-sm w-20">
                  Qty
                </th>
                <th className="text-right py-3 px-3 text-gray-600 font-medium text-sm w-28">
                  Rate
                </th>
                <th className="text-right py-3 px-3 text-gray-600 font-medium text-sm w-32">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => (
                <tr key={item.id} className="border-b border-gray-200">
                  <td className="py-3 px-3 text-gray-900 text-sm align-top">
                    {index + 1}
                  </td>
                  <td className="py-3 px-3 text-gray-900 text-sm">
                    <div className="font-medium">{item.description.split("\n")[0]}</div>
                    {item.description.includes("\n") && (
                      <div className="text-gray-500 text-xs mt-1">
                        {item.description.split("\n").slice(1).join("\n")}
                      </div>
                    )}
                    {item.location && (
                      <div className="text-gray-500 text-xs mt-1">{item.location}</div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-gray-900 text-sm text-center">
                    {item.quantity.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-gray-900 text-sm text-right">
                    {formatCurrency(item.price)}
                  </td>
                  <td className="py-3 px-3 text-gray-900 text-sm text-right">
                    {formatCurrency(item.quantity * item.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="flex justify-end mb-8">
          <table className="w-[300px]">
            <tbody className="text-sm">
              <tr>
                <td className="py-2 text-right text-gray-600">Sub Total</td>
                <td className="py-2 text-right text-gray-900 pl-8 w-32">
                  {formatCurrency(taxType === "inclusive" ? subtotal - vatAmount : subtotal)}
                </td>
              </tr>
              {shippingCharge > 0 && (
                <tr>
                  <td className="py-2 text-right text-gray-600">
                    Shipping charge
                    <br />
                    <span className="text-xs text-gray-400">(VAT (7.5%) )</span>
                  </td>
                  <td className="py-2 text-right text-gray-900 pl-8">
                    {formatCurrency(shippingCharge)}
                  </td>
                </tr>
              )}
              {taxType !== "none" && vatAmount > 0 && (
                <tr>
                  <td className="py-2 text-right text-gray-600">VAT (7.5%)</td>
                  <td className="py-2 text-right text-gray-900 pl-8">
                    {formatCurrency(vatAmount)}
                  </td>
                </tr>
              )}
              <tr className="border-t border-gray-300">
                <td className="py-3 text-right font-semibold text-gray-900">Total</td>
                <td className="py-3 text-right font-semibold text-gray-900 pl-8">
                  NGN{formatCurrency(total)}
                </td>
              </tr>
              <tr className="bg-gray-100">
                <td className="py-3 px-3 text-right font-semibold text-gray-900">
                  Balance Due
                </td>
                <td className="py-3 px-3 text-right font-bold text-gray-900">
                  NGN{formatCurrency(displayBalanceDue)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes Section */}
        {notes && (
          <div className="mb-8 text-sm text-gray-600">
            <p>{notes}</p>
          </div>
        )}

        {/* Bank Details */}
        {bankDetails && (
          <div className="mb-8 text-sm">
            <p className="text-gray-900">{bankDetails.account_number}</p>
            <p className="text-gray-600">{bankDetails.bank_name}</p>
          </div>
        )}

        {/* Footer - Signature and TIN */}
        <div className="border-t border-gray-200 pt-6 mt-8">
          <div className="flex justify-between items-end">
            <div>
              {companyProfile?.company_name && (
                <p className="text-sm text-gray-600">{companyProfile.company_name}</p>
              )}
              {companyProfile?.tin_number && (
                <p className="text-sm text-gray-600">TIN - {companyProfile.tin_number}</p>
              )}
            </div>
            <div className="text-center">
              {companyProfile?.authorized_signature && (
                <div className="mb-2">
                  <img
                    src={companyProfile.authorized_signature}
                    alt="Authorized Signature"
                    className="max-h-16 object-contain mx-auto"
                  />
                </div>
              )}
              <p className="text-sm text-gray-600 border-t border-gray-300 pt-2">
                For {companyProfile?.company_name || "Company"}
              </p>
            </div>
          </div>
        </div>

        {/* Page Number */}
        <div className="text-center text-xs text-gray-400 mt-8 pt-4 border-t border-gray-200">
          1
        </div>
      </div>
    );
  }
);

InvoiceTemplate.displayName = "InvoiceTemplate";

export default InvoiceTemplate;
