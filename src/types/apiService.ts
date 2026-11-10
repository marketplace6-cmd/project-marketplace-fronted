import {
  ProjectDTO,
  StudentProfile,
  MeetingRecord,
  OrderRecord,
  SupportTicket
} from './types';
import {
  INITIAL_PROJECTS,
  INITIAL_STUDENT,
  INITIAL_MEETINGS,
  INITIAL_ORDERS,
  INITIAL_TICKETS
} from './mockData';

// Controlled via .env (Defaults to true for frontend-only delivery)
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== 'false';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    },
    credentials: 'include',
    ...options
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `API Error: ${response.status}`);
  }
  return response.json();
}

export const MarketplaceAPI = {
  // 1. Fetch Public Project Catalogue
  async getProjects(): Promise<ProjectDTO[]> {
    if (USE_MOCK_API) return Promise.resolve(INITIAL_PROJECTS);
    return request<ProjectDTO[]>('/projects');
  },

  // 2. Fetch Authoritative Student Profile & 5-Heart Preview Credits
  async getStudentProfile(): Promise<StudentProfile> {
    if (USE_MOCK_API) return Promise.resolve(INITIAL_STUDENT);
    return request<StudentProfile>('/student/me');
  },

  // 3. Submit Student ID Card for Verification
  async submitStudentVerification(formData: FormData): Promise<{ status: string; message: string }> {
    if (USE_MOCK_API) {
      return Promise.resolve({
        status: 'verification_pending',
        message: 'Student ID uploaded successfully. Pending admin review.'
      });
    }
    return request('/student/verify-id', {
      method: 'POST',
      body: formData
    });
  },

  // 4. Record PPT Preview Access & Deduct 1 Heart Credit on Server
  async unlockPptPreview(projectId: string): Promise<{ remainingPreviews: number; usedPreviews: number }> {
    if (USE_MOCK_API) {
      return Promise.resolve({ remainingPreviews: 2, usedPreviews: 3 });
    }
    return request(`/projects/${projectId}/preview`, { method: 'POST' });
  },

  // 5. Request a 5-Minute Google Meet Slot (Max 3 Projects)
  async requestGuidanceMeeting(payload: {
    projectId: string;
    date: string;
    timeSlot: string;
  }): Promise<MeetingRecord> {
    if (USE_MOCK_API) {
      return Promise.resolve({
        id: `MEET-${Math.floor(100 + Math.random() * 900)}`,
        projectId: payload.projectId,
        projectTitle: 'Selected Academic Project',
        date: payload.date,
        timeSlot: payload.timeSlot,
        durationMinutes: 5,
        status: 'Request Submitted'
      });
    }
    return request<MeetingRecord>('/meetings/request', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // 6. Fetch Meetings, Orders & Support Tickets
  async getMeetings(): Promise<MeetingRecord[]> {
    if (USE_MOCK_API) return Promise.resolve(INITIAL_MEETINGS);
    return request<MeetingRecord[]>('/meetings');
  },

  async getOrders(): Promise<OrderRecord[]> {
    if (USE_MOCK_API) return Promise.resolve(INITIAL_ORDERS);
    return request<OrderRecord[]>('/orders');
  },

  async getSupportTickets(): Promise<SupportTicket[]> {
    if (USE_MOCK_API) return Promise.resolve(INITIAL_TICKETS);
    return request<SupportTicket[]>('/support/tickets');
  }
};