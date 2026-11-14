import { MentorDirectDeal, MentorStats } from './mentorTypes';

export const INITIAL_MENTOR_DEALS: MentorDirectDeal[] = [
  {
    id: 'DEAL-801',
    studentId: 'STU-2026-0001',
    studentName: 'Mayank Kumar',
    studentContact: '+91 98765 43210',
    studentEmail: 'mayank.kumar@student.umu.ac.in',
    collegeName: 'Usha Martin University',
    projectId: 'PRJ-101',
    projectTitle: 'AI-Powered Resume Screener with NLP Ranking',
    projectCategory: 'Artificial Intelligence',
    listedPrice: 4999,
    agreedPrice: 4499,
    dealStatus: 'Agreed',
    deliveryStatus: 'Ready to Deliver',
    enquiryDate: '12 Nov 2026',
    lastUpdated: '14 Nov 2026',
    notes: 'Agreed upon ₹4,499 with customized viva preparation guide and architecture PPT slides.',
    deliveryLink: 'https://drive.google.com/drive/folders/uvikart-prj-101-mayank',
    paymentDetails: {
      transactionId: 'UPI-20261114-98421',
      paymentMode: 'UPI',
      paidAmount: 4499,
      proofFileName: 'upi_receipt_mayank_801.png',
      submittedAt: '14 Nov 2026, 02:30 PM',
      verifiedByAdmin: true,
      adminNotes: 'Verified via HDFC Merchant gateway'
    }
  },
  {
    id: 'DEAL-802',
    studentId: 'STU-2026-0014',
    studentName: 'Priya Sharma',
    studentContact: '+91 98112 34567',
    studentEmail: 'priya.s@dtu.ac.in',
    collegeName: 'Delhi Technological University',
    projectId: 'PRJ-102',
    projectTitle: 'Hospital Management System with Telehealth Support',
    projectCategory: 'Web Development',
    listedPrice: 3499,
    agreedPrice: 3200,
    dealStatus: 'Negotiating',
    deliveryStatus: 'Pending Discussion',
    enquiryDate: '13 Nov 2026',
    lastUpdated: '14 Nov 2026',
    notes: 'Negotiating on price including cloud deployment steps on AWS EC2 free tier.',
  },
  {
    id: 'DEAL-803',
    studentId: 'STU-2026-0028',
    studentName: 'Rahul Verma',
    studentContact: '+91 97234 56789',
    studentEmail: 'rahul.v@bitmesra.ac.in',
    collegeName: 'BIT Mesra',
    projectId: 'PRJ-103',
    projectTitle: 'Smart Agriculture IoT Soil & Moisture Monitor',
    projectCategory: 'Internet of Things',
    listedPrice: 5999,
    agreedPrice: 5999,
    dealStatus: 'New Enquiry',
    deliveryStatus: 'Pending Discussion',
    enquiryDate: '14 Nov 2026',
    lastUpdated: '14 Nov 2026',
    notes: 'Enquired about ESP32 and Arduino Uno sensor pin mapping compatibility.'
  },
  {
    id: 'DEAL-804',
    studentId: 'STU-2026-0035',
    studentName: 'Ananya Gupta',
    studentContact: '+91 99887 65432',
    studentEmail: 'ananya.g@iitb.ac.in',
    collegeName: 'IIT Bombay',
    projectId: 'PRJ-104',
    projectTitle: 'Decentralized Voting System on Polygon Blockchain',
    projectCategory: 'Cybersecurity',
    listedPrice: 6499,
    agreedPrice: 6000,
    dealStatus: 'Payment Submitted',
    deliveryStatus: 'Customizing Project',
    enquiryDate: '10 Nov 2026',
    lastUpdated: '14 Nov 2026',
    notes: 'Payment submitted by student via PhonePe UPI. Awaiting Admin verification before final code delivery.',
    deliveryLink: '',
    paymentDetails: {
      transactionId: 'UPI-UTR-98726351982',
      paymentMode: 'UPI',
      paidAmount: 6000,
      proofFileName: 'phonepe_utr_98726351.jpg',
      submittedAt: '14 Nov 2026, 11:20 AM',
      verifiedByAdmin: false,
      adminNotes: 'Submitted for verification'
    }
  },
  {
    id: 'DEAL-805',
    studentId: 'STU-2026-0042',
    studentName: 'Arjun Mehta',
    studentContact: '+91 94567 89012',
    studentEmail: 'arjun.m@vit.ac.in',
    collegeName: 'VIT Vellore',
    projectId: 'PRJ-105',
    projectTitle: 'Autonomous Delivery Rover with LiDAR SLAM',
    projectCategory: 'Machine Learning',
    listedPrice: 7999,
    agreedPrice: 7500,
    dealStatus: 'Verified & Closed',
    deliveryStatus: 'Delivered via WhatsApp',
    enquiryDate: '08 Nov 2026',
    lastUpdated: '12 Nov 2026',
    notes: 'Full ROS workspace, model weights, and 15-minute video walkthrough delivered via WhatsApp and Drive.',
    deliveryLink: 'https://drive.google.com/drive/folders/uvikart-rover-arjun',
    paymentDetails: {
      transactionId: 'HDFC-IMPS-7749210',
      paymentMode: 'Bank Transfer',
      paidAmount: 7500,
      proofFileName: 'bank_imps_7749210.pdf',
      submittedAt: '11 Nov 2026, 04:45 PM',
      verifiedByAdmin: true,
      adminNotes: 'Cleared and confirmed by finance'
    }
  }
];

export function getStoredMentorDeals(): MentorDirectDeal[] {
  try {
    const raw = localStorage.getItem('uvikart_mentor_deals');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    /* fallback to initial */
  }
  return INITIAL_MENTOR_DEALS;
}

export function saveStoredMentorDeals(deals: MentorDirectDeal[]): void {
  try {
    localStorage.setItem('uvikart_mentor_deals', JSON.stringify(deals));
  } catch {
    /* ignore storage errors */
  }
}

export function calculateMentorStats(deals: MentorDirectDeal[]): MentorStats {
  const assignedStudents = new Set(deals.map((d) => d.studentId)).size;
  const activeEnquiries = deals.filter((d) => d.dealStatus === 'New Enquiry' || d.dealStatus === 'Negotiating').length;
  const dealsClosed = deals.filter((d) => d.dealStatus === 'Agreed' || d.dealStatus === 'Verified & Closed').length;
  const pendingDeliveries = deals.filter((d) =>
    (d.dealStatus === 'Agreed' || d.dealStatus === 'Payment Submitted') &&
    d.deliveryStatus !== 'Delivered via WhatsApp' &&
    d.deliveryStatus !== 'Delivered via Drive'
  ).length;

  const totalEarnings = deals
    .filter((d) => d.dealStatus === 'Agreed' || d.dealStatus === 'Verified & Closed')
    .reduce((sum, d) => sum + d.agreedPrice, 0);

  return {
    assignedStudents,
    activeEnquiries,
    dealsClosed,
    pendingDeliveries,
    totalEarnings
  };
}
