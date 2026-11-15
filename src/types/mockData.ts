import { ProjectDTO, StudentProfile, MeetingRecord, OrderRecord, SupportTicket } from './types';

export const INITIAL_PROJECTS: ProjectDTO[] = [];

// Default student state for Unikart marketplace (isolated per user)
export const INITIAL_STUDENT: StudentProfile = {
  id: '',
  fullName: '',
  mobile: '',
  email: '',
  collegeName: '',
  referralCode: '',
  authState: 'logged_out',
  role: 'student',
  idDocumentName: '',
  previewStats: {
    totalAllowed: 5,
    usedPreviews: 0,
    remainingPreviews: 5,
    nextResetDate: '90-Day Cycle'
  },
  viewedProjectIds: [],
  selectedProjectIds: [],
};

export const INITIAL_MEETINGS: MeetingRecord[] = [];
export const INITIAL_ORDERS: OrderRecord[] = [];
export const INITIAL_TICKETS: SupportTicket[] = [];

export const AVAILABLE_TIME_SLOTS = [
  '11:00 AM - 11:05 AM IST',
  '02:30 PM - 02:35 PM IST',
  '04:00 PM - 04:05 PM IST',
  '05:30 PM - 05:35 PM IST'
];