import React, { useState, useMemo } from 'react';
import {
  Users,
  MessageSquare,
  CheckCircle,
  Truck,
  DollarSign,
  Search,
  Edit3,
  X,
  ExternalLink,
  Phone,
  MessageCircle,
  ShieldCheck,
  RefreshCw,
  Briefcase,
  GraduationCap,
  Menu,
  LogOut,
  ArrowLeft
} from 'lucide-react';
import {
  MentorDirectDeal,
  DealStatus,
  DeliveryStatus,
  DealPaymentSubmission
} from './mentorTypes';
import {
  getStoredMentorDeals,
  saveStoredMentorDeals,
  calculateMentorStats
} from './mockMentorData';

interface MentorDashboardProps {
  onNavigate: (route: any) => void;
  onLogout?: () => void;
  embedded?: boolean;
}

export default function MentorDashboard({ onNavigate, onLogout, embedded = false }: MentorDashboardProps) {
  const [deals, setDeals] = useState<MentorDirectDeal[]>(() => getStoredMentorDeals());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('All');
  const [selectedDeal, setSelectedDeal] = useState<MentorDirectDeal | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Quick edit state for inline price modification
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlinePriceValue, setInlinePriceValue] = useState<number>(0);

  // Modal edit form state
  const [modalAgreedPrice, setModalAgreedPrice] = useState<number>(0);
  const [modalDealStatus, setModalDealStatus] = useState<DealStatus>('New Enquiry');
  const [modalDeliveryStatus, setModalDeliveryStatus] = useState<DeliveryStatus>('Pending Discussion');
  const [modalDeliveryLink, setModalDeliveryLink] = useState<string>('');
  const [modalNotes, setModalNotes] = useState<string>('');

  // Payment proof form state
  const [paymentTxnId, setPaymentTxnId] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'Bank Transfer' | 'QR Scan' | 'Direct Cash'>('UPI');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentProofName, setPaymentProofName] = useState<string>('');
  const [paymentVerified, setPaymentVerified] = useState<boolean>(false);

  // Compute live stats
  const stats = useMemo(() => calculateMentorStats(deals), [deals]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filtered deals
  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      const matchesSearch =
        deal.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.studentContact.includes(searchQuery) ||
        deal.projectTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.collegeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.id.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedStatusFilter === 'All') return true;
      if (selectedStatusFilter === 'Active Enquiries') {
        return deal.dealStatus === 'New Enquiry' || deal.dealStatus === 'Negotiating';
      }
      return deal.dealStatus === selectedStatusFilter;
    });
  }, [deals, searchQuery, selectedStatusFilter]);

  // Handle open modal
  const handleOpenDealModal = (deal: MentorDirectDeal) => {
    setSelectedDeal(deal);
    setModalAgreedPrice(deal.agreedPrice);
    setModalDealStatus(deal.dealStatus);
    setModalDeliveryStatus(deal.deliveryStatus);
    setModalDeliveryLink(deal.deliveryLink || '');
    setModalNotes(deal.notes || '');

    if (deal.paymentDetails) {
      setPaymentTxnId(deal.paymentDetails.transactionId);
      setPaymentMode(deal.paymentDetails.paymentMode);
      setPaymentAmount(deal.paymentDetails.paidAmount);
      setPaymentProofName(deal.paymentDetails.proofFileName || 'receipt_proof.png');
      setPaymentVerified(deal.paymentDetails.verifiedByAdmin);
    } else {
      setPaymentTxnId('');
      setPaymentMode('UPI');
      setPaymentAmount(deal.agreedPrice);
      setPaymentProofName('');
      setPaymentVerified(false);
    }
  };

  // Save changes from modal
  const handleSaveDealModal = () => {
    if (!selectedDeal) return;

    let updatedPayment: DealPaymentSubmission | undefined = selectedDeal.paymentDetails;
    if (paymentTxnId.trim() || modalDealStatus === 'Payment Submitted' || modalDealStatus === 'Verified & Closed') {
      updatedPayment = {
        transactionId: paymentTxnId.trim() || `TXN-${Date.now().toString().slice(-6)}`,
        paymentMode: paymentMode,
        paidAmount: Number(paymentAmount) || Number(modalAgreedPrice),
        proofFileName: paymentProofName || 'payment_proof_upload.png',
        submittedAt: selectedDeal.paymentDetails?.submittedAt || new Date().toLocaleString(),
        verifiedByAdmin: paymentVerified,
        adminNotes: paymentVerified ? 'Verified by Admin verification queue' : 'Pending verification review'
      };
    }

    const updatedDeals = deals.map((d) => {
      if (d.id === selectedDeal.id) {
        return {
          ...d,
          agreedPrice: Number(modalAgreedPrice),
          dealStatus: modalDealStatus,
          deliveryStatus: modalDeliveryStatus,
          deliveryLink: modalDeliveryLink.trim(),
          notes: modalNotes.trim(),
          lastUpdated: '14 Nov 2026 (Just now)',
          paymentDetails: updatedPayment
        };
      }
      return d;
    });

    setDeals(updatedDeals);
    saveStoredMentorDeals(updatedDeals);
    setSelectedDeal(null);
    showToast(`Deal ${selectedDeal.id} for ${selectedDeal.studentName} updated successfully!`);
  };

  // Save inline quick price edit
  const handleSaveInlinePrice = (dealId: string) => {
    if (inlinePriceValue <= 0) {
      setInlineEditingId(null);
      return;
    }
    const updatedDeals = deals.map((d) => {
      if (d.id === dealId) {
        return {
          ...d,
          agreedPrice: inlinePriceValue,
          lastUpdated: 'Just now'
        };
      }
      return d;
    });
    setDeals(updatedDeals);
    saveStoredMentorDeals(updatedDeals);
    setInlineEditingId(null);
    showToast(`Agreed price updated to ₹${inlinePriceValue.toLocaleString()}`);
  };

  // WhatsApp quick launcher
  const openWhatsApp = (phone: string, studentName: string, projectTitle: string, price: number) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(
      `Hello ${studentName}! I am your mentor on Unikart regarding your project "${projectTitle}". Our agreed package price is ₹${price}. Please let me know if you would like to proceed with the code files and scheduled guidance session.`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const getStatusBadge = (status: DealStatus) => {
    switch (status) {
      case 'New Enquiry':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Negotiating':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Agreed':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Payment Submitted':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'Verified & Closed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getDeliveryBadge = (status: DeliveryStatus) => {
    switch (status) {
      case 'Delivered via WhatsApp':
      case 'Delivered via Drive':
        return 'bg-emerald-100 text-emerald-800';
      case 'Ready to Deliver':
        return 'bg-indigo-100 text-indigo-800';
      case 'Customizing Project':
        return 'bg-violet-100 text-violet-800';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className={embedded ? "w-full space-y-6" : "min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900"}>
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Top Mentor Header */}
      {!embedded && (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                className="lg:hidden p-2 rounded-xl text-slate-700 hover:bg-slate-100"
                aria-label="Toggle navigation"
              >
                <Menu className="w-5 h-5" />
              </button>

              <button onClick={() => onNavigate('home')} className="flex items-center gap-2.5 text-left">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-700 to-indigo-500 text-white flex items-center justify-center font-extrabold text-lg shadow-sm">
                  U
                </div>
                <div>
                  <span className="font-extrabold text-base tracking-tight text-slate-900">Unikart</span>
                  <span className="block text-[9px] font-mono text-indigo-600 font-bold uppercase tracking-wider -mt-0.5">
                    Mentor Workspace
                  </span>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* Quick Role Switcher */}
              <button
                onClick={() => onNavigate('home')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Student Marketplace
              </button>

              <button
                onClick={() => onNavigate('admin-login')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Admin Portal
              </button>

              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  AK
                </div>
                <div className="hidden md:block text-left text-xs">
                  <div className="font-bold text-slate-900 leading-none">Prof. A. K. Sharma</div>
                  <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">Verified Lead Mentor</div>
                </div>
                <button
                  onClick={() => (onLogout ? onLogout() : onNavigate('home'))}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-1"
                  title="Exit Mentor Workspace"
                  aria-label="Exit Mentor Workspace"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main Container */}
      <div className={embedded ? "w-full space-y-6" : "max-w-7xl mx-auto w-full px-4 py-8 flex-1 space-y-8"}>
        {/* Mentor Title & Introduction */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-sm">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-400/30">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-300" />
              {embedded ? 'Admin Supervised • Mentor Pipeline' : 'Direct Deal & Mentorship Pipeline'}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Mentor Direct Deal Interface</h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Negotiate project customizations directly with students, update agreed package pricing, coordinate asset deliveries, and submit transaction receipts for Admin verification.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const refreshed = getStoredMentorDeals();
                setDeals([...refreshed]);
                showToast('Deals and statistics refreshed.');
              }}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Refresh Pipeline
            </button>
          </div>
        </div>

        {/* 1. KEY MENTOR STATS AT TOP */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Stat 1: Assigned Students */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Assigned Students</span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900">{stats.assignedStudents}</div>
              <p className="text-[11px] text-slate-500 mt-0.5">Enrolled for guidance</p>
            </div>
          </div>

          {/* Stat 2: Active Enquiries */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Enquiries</span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <MessageSquare className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900">{stats.activeEnquiries}</div>
              <p className="text-[11px] text-amber-600 font-semibold mt-0.5">Negotiations in progress</p>
            </div>
          </div>

          {/* Stat 3: Deals Closed */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Deals Closed</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900">{stats.dealsClosed}</div>
              <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Verified & confirmed deals</p>
            </div>
          </div>

          {/* Stat 4: Pending Deliveries */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pending Deliveries</span>
              <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900">{stats.pendingDeliveries}</div>
              <p className="text-[11px] text-violet-600 font-semibold mt-0.5">Code files & PPT handover</p>
            </div>
          </div>
        </div>

        {/* 2. ENQUIRIES & DIRECT DEALS TABLE / LIST */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          {/* Filter Bar & Search */}
          <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">Enquiries & Direct Deals</h2>
              <p className="text-xs text-slate-500">Track and manage student project pricing, payment proof, and handover</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search box */}
              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search student, contact, project..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Status Tabs */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                {['All', 'Active Enquiries', 'Agreed', 'Payment Submitted', 'Verified & Closed'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setSelectedStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg transition-colors text-xs ${
                      selectedStatusFilter === status
                        ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Deal ID & Student</th>
                  <th className="py-3.5 px-4">Direct Contact</th>
                  <th className="py-3.5 px-4">Selected Project</th>
                  <th className="py-3.5 px-4">Deal Status</th>
                  <th className="py-3.5 px-4">Quoted / Agreed Price</th>
                  <th className="py-3.5 px-4">Delivery Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDeals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No direct deals match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredDeals.map((deal) => {
                    const isInlineEditing = inlineEditingId === deal.id;

                    return (
                      <tr key={deal.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Student Name & Info */}
                        <td className="py-4 px-4 align-top">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                              {deal.studentName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <span className="font-extrabold text-sm text-slate-900 block truncate">
                                {deal.studentName}
                              </span>
                              <span className="text-[10px] text-slate-500 block truncate">
                                {deal.collegeName}
                              </span>
                              <span className="font-mono text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded mt-0.5 inline-block">
                                {deal.id}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Direct Contact (WhatsApp / Phone) */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-1.5">
                            <div className="font-mono text-slate-800 font-semibold">{deal.studentContact}</div>
                            <div className="flex items-center gap-1.5">
                              {/* Direct WhatsApp button */}
                              <button
                                onClick={() => openWhatsApp(deal.studentContact, deal.studentName, deal.projectTitle, deal.agreedPrice)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-[10px] transition-colors shadow-2xs"
                                title="Open WhatsApp Chat"
                              >
                                <MessageCircle className="w-3 h-3" /> WhatsApp
                              </button>
                              {/* Direct phone call button */}
                              <a
                                href={`tel:${deal.studentContact}`}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px] transition-colors"
                                title="Call student"
                              >
                                <Phone className="w-3 h-3" /> Call
                              </a>
                            </div>
                          </div>
                        </td>

                        {/* Selected Project */}
                        <td className="py-4 px-4 align-top max-w-xs">
                          <div className="font-bold text-slate-900 leading-snug">{deal.projectTitle}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                              {deal.projectCategory}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">{deal.projectId}</span>
                          </div>
                        </td>

                        {/* Deal Status */}
                        <td className="py-4 px-4 align-top">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${getStatusBadge(deal.dealStatus)}`}>
                            {deal.dealStatus}
                          </span>
                          {deal.paymentDetails && (
                            <div className="mt-1 flex items-center gap-1 text-[10px]">
                              {deal.paymentDetails.verifiedByAdmin ? (
                                <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                                  <ShieldCheck className="w-3 h-3 text-emerald-600" /> Admin Verified
                                </span>
                              ) : (
                                <span className="text-amber-700 font-medium">Awaiting Admin Check</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Quoted / Agreed Price field (Editable!) */}
                        <td className="py-4 px-4 align-top">
                          <div className="space-y-1">
                            <div className="text-[10px] text-slate-400 line-through">
                              List: ₹{deal.listedPrice.toLocaleString()}
                            </div>

                            {isInlineEditing ? (
                              <div className="flex items-center gap-1 mt-1">
                                <input
                                  type="number"
                                  value={inlinePriceValue}
                                  onChange={(e) => setInlinePriceValue(Number(e.target.value))}
                                  className="w-24 px-2 py-1 text-xs font-bold border border-indigo-400 rounded-lg focus:outline-hidden"
                                />
                                <button
                                  onClick={() => handleSaveInlinePrice(deal.id)}
                                  className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                  title="Save price"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setInlineEditingId(null)}
                                  className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-slate-900">
                                  ₹{deal.agreedPrice.toLocaleString()}
                                </span>
                                <button
                                  onClick={() => {
                                    setInlineEditingId(deal.id);
                                    setInlinePriceValue(deal.agreedPrice);
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                                  title="Quick edit agreed price"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            {deal.agreedPrice < deal.listedPrice && (
                              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded inline-block">
                                Saved ₹{(deal.listedPrice - deal.agreedPrice).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Delivery Status */}
                        <td className="py-4 px-4 align-top">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${getDeliveryBadge(deal.deliveryStatus)}`}>
                            {deal.deliveryStatus}
                          </span>
                        </td>

                        {/* Action: Open Manage Deal Modal */}
                        <td className="py-4 px-4 align-top text-right">
                          <button
                            onClick={() => handleOpenDealModal(deal)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors shadow-2xs"
                          >
                            <Briefcase className="w-3.5 h-3.5" /> Manage Deal
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. INTERACTIVE "MANAGE DEAL / SUBMIT PAYMENT" MODAL / DRAWER */}
      {selectedDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            onClick={() => setSelectedDeal(null)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            aria-label="Close dialog"
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden z-10 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 relative">
              <button
                onClick={() => setSelectedDeal(null)}
                className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-xs font-bold bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded">
                  {selectedDeal.id}
                </span>
                <span className="text-xs text-slate-300">• {selectedDeal.enquiryDate}</span>
              </div>
              <h3 className="text-xl font-black text-white">{selectedDeal.studentName}</h3>
              <p className="text-xs text-indigo-200">{selectedDeal.collegeName} • {selectedDeal.studentContact}</p>
              <p className="text-xs text-slate-300 mt-1 font-semibold">{selectedDeal.projectTitle}</p>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              {/* SECTION A: Price Negotiation & Deal Status */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-indigo-600" />
                  Price Negotiation & Deal Status
                </h4>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Agreed Price (₹) <span className="text-slate-400 font-normal">(Listed: ₹{selectedDeal.listedPrice})</span>
                    </label>
                    <input
                      type="number"
                      value={modalAgreedPrice}
                      onChange={(e) => setModalAgreedPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm font-bold bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Deal Status</label>
                    <select
                      value={modalDealStatus}
                      onChange={(e) => setModalDealStatus(e.target.value as DealStatus)}
                      className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="New Enquiry">New Enquiry</option>
                      <option value="Negotiating">Negotiating</option>
                      <option value="Agreed">Agreed</option>
                      <option value="Payment Submitted">Payment Submitted</option>
                      <option value="Verified & Closed">Verified & Closed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Negotiation & Viva Notes</label>
                  <textarea
                    rows={2}
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    placeholder="Enter customized requirements, viva guidance requirements, or delivery schedule..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* SECTION B: Payment Submission for Admin Verification */}
              <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-indigo-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Payment Verification Submission
                  </h4>
                  {paymentVerified ? (
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-emerald-600" /> Verified by Admin
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                      Pending Admin Review
                    </span>
                  )}
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Transaction / UTR ID</label>
                    <input
                      type="text"
                      placeholder="e.g. UPI-9842109823"
                      value={paymentTxnId}
                      onChange={(e) => setPaymentTxnId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Payment Mode</label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value as any)}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="UPI">UPI / PhonePe / GPay</option>
                      <option value="Bank Transfer">Bank Transfer (IMPS/NEFT)</option>
                      <option value="QR Scan">Unikart QR Scan</option>
                      <option value="Direct Cash">Direct Cash</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Amount Paid (₹)</label>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-1">Payment Proof / Screenshot</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setPaymentProofName(file.name);
                      }}
                      className="text-[11px] text-slate-500 flex-1"
                    />
                    {paymentProofName && (
                      <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                        {paymentProofName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="admin-verify-check"
                    checked={paymentVerified}
                    onChange={(e) => setPaymentVerified(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                  />
                  <label htmlFor="admin-verify-check" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    Mark as Verified by Admin (simulates finance approval)
                  </label>
                </div>
              </div>

              {/* SECTION C: Project Asset Delivery Coordination */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-violet-600" />
                  Asset Delivery Coordination
                </h4>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Delivery Status</label>
                    <select
                      value={modalDeliveryStatus}
                      onChange={(e) => setModalDeliveryStatus(e.target.value as DeliveryStatus)}
                      className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl"
                    >
                      <option value="Pending Discussion">Pending Discussion</option>
                      <option value="Customizing Project">Customizing Project</option>
                      <option value="Ready to Deliver">Ready to Deliver</option>
                      <option value="Delivered via WhatsApp">Delivered via WhatsApp</option>
                      <option value="Delivered via Drive">Delivered via Drive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Project Deliverables Link (Drive/Zip)</label>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/..."
                      value={modalDeliveryLink}
                      onChange={(e) => setModalDeliveryLink(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                </div>

                {/* Direct Action Buttons */}
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openWhatsApp(selectedDeal.studentContact, selectedDeal.studentName, selectedDeal.projectTitle, modalAgreedPrice)}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-2xs"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Dispatch Files via WhatsApp
                  </button>
                  {modalDeliveryLink && (
                    <a
                      href={modalDeliveryLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Test Drive Link
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedDeal(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDealModal}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors"
                >
                  Save & Apply Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
