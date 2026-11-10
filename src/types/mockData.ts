import { ProjectDTO, StudentProfile, MeetingRecord, OrderRecord, SupportTicket } from './types';

export const INITIAL_PROJECTS: ProjectDTO[] = [
  {
    id: 'PRJ-101',
    title: 'Smart Campus Attendance & Academic Analytics Portal',
    category: 'Web Development',
    projectType: 'Final Year Capstone',
    shortDescription: 'A role-based academic tracking platform with automated attendance reports, department analytics, and student progress tracking.',
    problemStatement: 'Traditional manual attendance registers and disconnected spreadsheets cause delays in calculating student eligibility and identifying academic drop-offs.',
    technologies: ['React.js', 'TypeScript', 'Node.js', 'Express', 'MongoDB'],
    difficulty: 'Intermediate',
    suitableBranches: ['BCA', 'B.Tech CSE', 'B.Sc IT', 'MCA'],
    featureCategories: ['Role-Based Access Control', 'Interactive Analytics Charts', 'CSV/PDF Report Exporter', 'Automated Alerts'],
    deliverables: ['Complete Source Code', 'Project Synopsis & IEEE Report (60 Pages)', 'Presentation PPT', 'Setup & Viva Guide'],
    previewEligible: true,
    price: 1499,
    genericPatternTheme: 'from-indigo-600 via-blue-600 to-cyan-500',
    pptSlides: [
      {
        slideNumber: 1,
        heading: 'Executive Summary & Problem Definition',
        bullets: [
          'Addresses administrative bottlenecks in multi-department attendance tracking.',
          'Provides real-time shortage alerts for students below 75% attendance.',
          'Designed for scalable deployment across college departments.'
        ],
        footerNote: 'Protected Preview — Confidential Implementation Omitted'
      }
    ]
  },
  {
    id: 'PRJ-102',
    title: 'AI-Powered Resume Screening & Skill Gap Analyzer',
    category: 'Artificial Intelligence',
    projectType: 'Major Project',
    shortDescription: 'NLP-driven candidate evaluation tool that matches student resumes against job descriptions and recommends learning paths.',
    problemStatement: 'Campus placement cells and students struggle to objectively evaluate resume readiness against specific technical job roles.',
    technologies: ['Python', 'FastAPI', 'React.js', 'Scikit-Learn', 'NLP'],
    difficulty: 'Advanced',
    suitableBranches: ['B.Tech AI/ML', 'B.Tech CSE', 'MCA', 'M.Sc Data Science'],
    featureCategories: ['PDF Resume Parsing', 'Keyword & Semantic Matching', 'Skill Gap Visualization', 'Placement Readiness Score'],
    deliverables: ['Complete Source Code', 'Dataset & Model Weights', 'Project Report & PPT', 'Installation Walkthrough Video'],
    previewEligible: true,
    price: 1999,
    genericPatternTheme: 'from-emerald-600 via-teal-600 to-cyan-600',
    pptSlides: [
      {
        slideNumber: 1,
        heading: 'Introduction to NLP Resume Evaluation',
        bullets: [
          'Automates initial screening of unstructured PDF and DOCX resumes.',
          'Computes cosine similarity between candidate skills and role requirements.',
          'Highlights missing technical competencies for student self-improvement.'
        ],
        footerNote: 'Protected Preview — Proprietary Weights Omitted'
      }
    ]
  }
];

// Clean generic student state with zero personal data
export const INITIAL_STUDENT: StudentProfile = {
  id: 'STU-000-000',
  fullName: '',
  mobile: '',
  email: '',
  collegeName: '',
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