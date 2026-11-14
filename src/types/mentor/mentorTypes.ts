export type DealStatus =
  | 'New Enquiry'
  | 'Negotiating'
  | 'Agreed'
  | 'Payment Submitted'
  | 'Verified & Closed';

export type DeliveryStatus =
  | 'Pending Discussion'
  | 'Customizing Project'
  | 'Ready to Deliver'
  | 'Delivered via WhatsApp'
  | 'Delivered via Drive';

export interface DealPaymentSubmission {
  transactionId: string;
  paymentMode: 'UPI' | 'Bank Transfer' | 'QR Scan' | 'Direct Cash';
  paidAmount: number;
  paymentProofUrl?: string;
  proofFileName?: string;
  submittedAt: string;
  verifiedByAdmin: boolean;
  adminNotes?: string;
}

export interface MentorDirectDeal {
  id: string; // e.g. "DEAL-801"
  studentId: string;
  studentName: string;
  studentContact: string; // WhatsApp / Phone
  studentEmail: string;
  collegeName: string;
  projectId: string;
  projectTitle: string;
  projectCategory: string;
  listedPrice: number;
  agreedPrice: number;
  dealStatus: DealStatus;
  deliveryStatus: DeliveryStatus;
  enquiryDate: string;
  lastUpdated: string;
  notes: string;
  deliveryLink?: string;
  paymentDetails?: DealPaymentSubmission;
}

export interface MentorStats {
  assignedStudents: number;
  activeEnquiries: number;
  dealsClosed: number;
  pendingDeliveries: number;
  totalEarnings: number;
}
