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
  serviceCharge?: number;
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
      serviceCharge = 0,
      notes,
      companyProfile,
      bankDetails,
      balanceDue,
    },
    ref
  ) => {
    const displayBalanceDue = balanceDue ?? total;
    const baseSubtotal = taxType === "inclusive" ? subtotal - vatAmount : subtotal;

    return (
      <div
        ref={ref}
        style={{
          fontFamily: "Arial, Helvetica, sans-serif",
          backgroundColor: "#ffffff",
          color: "#1a1a1a",
          padding: "40px 48px",
          maxWidth: "800px",
          margin: "0 auto",
          fontSize: "13px",
          lineHeight: "1.4",
        }}
      >
        {/* ── TOP HEADER: Logo left │ Invoice title + balance right ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
          {/* Logo – left */}
          <div style={{ flexShrink: 0 }}>
            {companyProfile?.company_logo ? (
              <img
                src={companyProfile.company_logo}
                alt="Company Logo"
                style={{ maxWidth: "160px", maxHeight: "110px", objectFit: "contain", display: "block" }}
              />
            ) : (
              <div
                style={{
                  width: "110px",
                  height: "90px",
                  background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ color: "#fff", fontSize: "36px", fontWeight: "700" }}>
                  {companyProfile?.company_name?.charAt(0) || "C"}
                </span>
              </div>
            )}
          </div>

          {/* Invoice title + number + balance – right */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "38px", fontWeight: "300", color: "#555555", letterSpacing: "1px", marginBottom: "4px" }}>
              Invoice
            </div>
            <div style={{ fontSize: "12px", color: "#888888", marginBottom: "16px" }}>
              # {invoiceNumber}
            </div>
            <div style={{ fontSize: "10px", color: "#999999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
              Balance Due
            </div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: "#1a1a1a" }}>
              NGN{formatCurrency(displayBalanceDue)}
            </div>
          </div>
        </div>

        {/* ── COMPANY DETAILS (below logo, left-aligned) ── */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontWeight: "700", fontSize: "13px", color: "#1a1a1a", marginBottom: "4px" }}>
            {companyProfile?.company_name || "Your Company Name"}
          </div>
          {companyProfile?.company_address && (
            <div style={{ color: "#555555", fontSize: "12px", whiteSpace: "pre-line", lineHeight: "1.6" }}>
              {companyProfile.company_address}
            </div>
          )}
          {companyProfile?.company_phone && (
            <div style={{ color: "#555555", fontSize: "12px" }}>{companyProfile.company_phone}</div>
          )}
          {companyProfile?.company_email && (
            <div style={{ color: "#555555", fontSize: "12px" }}>{companyProfile.company_email}</div>
          )}
          {companyProfile?.website && (
            <div style={{ color: "#555555", fontSize: "12px" }}>{companyProfile.website}</div>
          )}
        </div>

        {/* ── BILL TO (left) │ INVOICE META (right) ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
          {/* Bill To – left */}
          <div>
            <div style={{ fontWeight: "700", fontSize: "13px", color: "#1a1a1a", marginBottom: "4px" }}>
              {customerName}
            </div>
            {customerAddress && (
              <div style={{ color: "#555555", fontSize: "12px", whiteSpace: "pre-line", maxWidth: "280px", lineHeight: "1.6" }}>
                {customerAddress}
              </div>
            )}
          </div>

          {/* Invoice meta – right */}
          <table style={{ borderCollapse: "collapse", fontSize: "12px" }}>
            <tbody>
              <tr>
                <td style={{ color: "#888888", paddingRight: "20px", paddingBottom: "4px", textAlign: "right" }}>Invoice Date :</td>
                <td style={{ color: "#1a1a1a", paddingBottom: "4px", textAlign: "right", minWidth: "100px" }}>{formatDate(invoiceDate)}</td>
              </tr>
              <tr>
                <td style={{ color: "#888888", paddingRight: "20px", paddingBottom: "4px", textAlign: "right" }}>Terms :</td>
                <td style={{ color: "#1a1a1a", paddingBottom: "4px", textAlign: "right" }}>{terms}</td>
              </tr>
              <tr>
                <td style={{ color: "#888888", paddingRight: "20px", textAlign: "right" }}>Due Date :</td>
                <td style={{ color: "#1a1a1a", textAlign: "right" }}>{formatDate(dueDate)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── ITEMS TABLE ── */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px" }}>
          <thead>
            <tr style={{ backgroundColor: "#2d2d2d" }}>
              <th style={{ padding: "10px 12px", color: "#ffffff", fontWeight: "600", fontSize: "12px", textAlign: "left", width: "40px" }}>#</th>
              <th style={{ padding: "10px 12px", color: "#ffffff", fontWeight: "600", fontSize: "12px", textAlign: "left" }}>Description</th>
              <th style={{ padding: "10px 12px", color: "#ffffff", fontWeight: "600", fontSize: "12px", textAlign: "center", width: "70px" }}>Qty</th>
              <th style={{ padding: "10px 12px", color: "#ffffff", fontWeight: "600", fontSize: "12px", textAlign: "right", width: "110px" }}>Rate</th>
              <th style={{ padding: "10px 12px", color: "#ffffff", fontWeight: "600", fontSize: "12px", textAlign: "right", width: "120px" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr
                key={item.id}
                style={{ borderBottom: "1px solid #e8e8e8", backgroundColor: index % 2 === 0 ? "#ffffff" : "#fafafa" }}
              >
                <td style={{ padding: "10px 12px", color: "#1a1a1a", fontSize: "12px", verticalAlign: "top" }}>
                  {index + 1}
                </td>
                <td style={{ padding: "10px 12px", fontSize: "12px", verticalAlign: "top" }}>
                  <div style={{ fontWeight: "500", color: "#1a1a1a" }}>
                    {item.description.split("\n")[0]}
                  </div>
                  {item.description.includes("\n") && (
                    <div style={{ color: "#888888", fontSize: "11px", marginTop: "2px" }}>
                      {item.description.split("\n").slice(1).join("\n")}
                    </div>
                  )}
                  {item.location && (
                    <div style={{ color: "#888888", fontSize: "11px", marginTop: "2px" }}>
                      {item.location}
                    </div>
                  )}
                </td>
                <td style={{ padding: "10px 12px", color: "#1a1a1a", fontSize: "12px", textAlign: "center", verticalAlign: "top" }}>
                  {item.quantity.toFixed(2)}
                </td>
                <td style={{ padding: "10px 12px", color: "#1a1a1a", fontSize: "12px", textAlign: "right", verticalAlign: "top" }}>
                  {formatCurrency(item.price)}
                </td>
                <td style={{ padding: "10px 12px", color: "#1a1a1a", fontSize: "12px", textAlign: "right", verticalAlign: "top" }}>
                  {formatCurrency(item.quantity * item.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── TOTALS (right-aligned) ── */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "32px" }}>
          <table style={{ borderCollapse: "collapse", minWidth: "280px", fontSize: "12px" }}>
            <tbody>
              <tr>
                <td style={{ padding: "6px 16px 6px 0", color: "#555555", textAlign: "right" }}>Sub Total</td>
                <td style={{ padding: "6px 0", color: "#1a1a1a", textAlign: "right", minWidth: "120px" }}>
                  {formatCurrency(baseSubtotal)}
                </td>
              </tr>
              {shippingCharge > 0 && (
                <tr>
                  <td style={{ padding: "6px 16px 6px 0", color: "#555555", textAlign: "right" }}>
                    Shipping charge
                    <br />
                    <span style={{ fontSize: "10px", color: "#999999" }}>(VAT (7.5%) )</span>
                  </td>
                  <td style={{ padding: "6px 0", color: "#1a1a1a", textAlign: "right" }}>
                    {formatCurrency(shippingCharge)}
                  </td>
                </tr>
              )}
              {serviceCharge > 0 && (
                <tr>
                  <td style={{ padding: "6px 16px 6px 0", color: "#555555", textAlign: "right" }}>
                    Service Charge
                    {taxType !== "none" && (
                      <>
                        <br />
                        <span style={{ fontSize: "10px", color: "#999999" }}>(VAT (7.5%) )</span>
                      </>
                    )}
                  </td>
                  <td style={{ padding: "6px 0", color: "#1a1a1a", textAlign: "right" }}>
                    {formatCurrency(serviceCharge)}
                  </td>
                </tr>
              )}
              {taxType !== "none" && vatAmount > 0 && (
                <tr>
                  <td style={{ padding: "6px 16px 6px 0", color: "#555555", textAlign: "right" }}>VAT (7.5%)</td>
                  <td style={{ padding: "6px 0", color: "#1a1a1a", textAlign: "right" }}>
                    {formatCurrency(vatAmount)}
                  </td>
                </tr>
              )}
              <tr style={{ borderTop: "1px solid #cccccc" }}>
                <td style={{ padding: "10px 16px 10px 0", fontWeight: "700", color: "#1a1a1a", textAlign: "right" }}>Total</td>
                <td style={{ padding: "10px 0", fontWeight: "700", color: "#1a1a1a", textAlign: "right" }}>
                  NGN{formatCurrency(total)}
                </td>
              </tr>
              <tr style={{ backgroundColor: "#f0f0f0" }}>
                <td style={{ padding: "10px 16px 10px 8px", fontWeight: "700", color: "#1a1a1a", textAlign: "right" }}>Balance Due</td>
                <td style={{ padding: "10px 8px 10px 0", fontWeight: "700", color: "#1a1a1a", textAlign: "right" }}>
                  NGN{formatCurrency(displayBalanceDue)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── NOTES ── */}
        {notes && (
          <div style={{ marginBottom: "24px", fontSize: "12px", color: "#555555" }}>
            <p>{notes}</p>
          </div>
        )}

        {/* ── BANK DETAILS ── */}
        {bankDetails && (
          <div style={{ marginBottom: "24px", fontSize: "12px" }}>
            <div style={{ color: "#1a1a1a", fontWeight: "500" }}>{bankDetails.account_number}</div>
            <div style={{ color: "#888888" }}>{bankDetails.bank_name}</div>
            {bankDetails.account_name && (
              <div style={{ color: "#888888" }}>{bankDetails.account_name}</div>
            )}
          </div>
        )}

        {/* ── FOOTER: TIN (left) │ Signature (right) ── */}
        <div style={{ borderTop: "1px solid #dddddd", paddingTop: "20px", marginTop: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ fontSize: "12px", color: "#888888" }}>
              {companyProfile?.company_name && (
                <div>{companyProfile.company_name}</div>
              )}
              {companyProfile?.tin_number && (
                <div>TIN - {companyProfile.tin_number}</div>
              )}
            </div>
            <div style={{ textAlign: "center" }}>
              {companyProfile?.authorized_signature && (
                <div style={{ marginBottom: "6px" }}>
                  <img
                    src={companyProfile.authorized_signature}
                    alt="Authorized Signature"
                    style={{ maxHeight: "56px", objectFit: "contain", display: "block", margin: "0 auto" }}
                  />
                </div>
              )}
              <div style={{ borderTop: "1px solid #cccccc", paddingTop: "6px", fontSize: "11px", color: "#888888", minWidth: "140px" }}>
                For {companyProfile?.company_name || "Company"}
              </div>
            </div>
          </div>
        </div>

        {/* ── PAGE NUMBER ── */}
        <div style={{ textAlign: "center", fontSize: "11px", color: "#cccccc", marginTop: "24px", borderTop: "1px solid #eeeeee", paddingTop: "12px" }}>
          1
        </div>
      </div>
    );
  }
);

InvoiceTemplate.displayName = "InvoiceTemplate";

export default InvoiceTemplate;
