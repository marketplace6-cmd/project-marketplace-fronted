/**
 * Customer Support Service
 * Handles fixed guaranteed preset support questions, auto-answers, and support email routing.
 */

export const SUPPORT_OFFICIAL_EMAIL = 'marketplacep6@gmail.com';

export interface SupportPresetQuestion {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export const SUPPORT_PRESET_QUESTIONS: SupportPresetQuestion[] = [
  {
    id: 'id-verification',
    category: 'Student ID Verification',
    question: 'Student ID verification kab hoga?',
    answer:
      'Student ID verification Admin ke end se 1 se 24 hours ke andar complete ho jayega. Agar 24 hours se zyada ho gaye hain toh kripya apna Student ID code ke saath marketplacep6@gmail.com par email karein.'
  },
  {
    id: 'meeting-link',
    category: 'Meeting Scheduling',
    question: 'Meeting link abhi tak nahi aaya hai',
    answer:
      'Aapka 5-minute Google Meet link 1 se 24 hours ke andar schedule karke 5-Min Meet page par update kar diya jayega (link milne ke baad maximum waiting time 10 minutes rahega). Agar session urgent hai toh kripya Admin ko marketplacep6@gmail.com par email karein.'
  },
  {
    id: 'refund-policy',
    category: 'Refund Requests',
    question: 'Refund kaise le sakte hain?',
    answer:
      'Agar aapko abhi tak project source code / ZIP file nahi mili hai toh refund possible hai. Lekin agar bill generate ho chuka hai aur project files email/deliver ho gayi hain, toh digital source code copy hone ke kaaran refund nahi hoga. Admin aapse jald hi contact karega, ya aap direct marketplacep6@gmail.com par email kar sakte hain.'
  },
  {
    id: 'budget-project',
    category: 'Project Pricing',
    question: 'Sasta / budget project chahiye',
    answer:
      'Saste ya budget-friendly project ke liye kripya marketplacep6@gmail.com par email karein aur batayein ki aapko kis topic aur technology stack par project chahiye—humari team aapko best available option share karegi.'
  },
  {
    id: 'custom-project',
    category: 'Custom Projects',
    question: 'New custom project banwana hai',
    answer:
      'Agar aapko apne topic par naya custom project banwana hai, toh kripya apna synopsis/requirements aur deadline likh kar marketplacep6@gmail.com par email karein. Humari technical team jald hi aapse contact karegi.'
  },
  {
    id: 'payment-delivery',
    category: 'Payment & Project Delivery',
    question: 'Payment UTR verify & ZIP delivery kab hogi?',
    answer:
      'Payment aur UTR verification ke baad aapki Project ZIP file aur Invoice Bill 1 se 24 hours ke andar My Purchases & Files tab mein unlock ho jayenge. Urgent delivery ke liye marketplacep6@gmail.com par UTR ke saath email karein.'
  }
];

export function getPresetAnswer(questionOrId: string): string {
  const match = SUPPORT_PRESET_QUESTIONS.find(
    (q) => q.id === questionOrId || q.question.toLowerCase().trim() === questionOrId.toLowerCase().trim()
  );
  if (match) return match.answer;

  const qLower = questionOrId.toLowerCase();
  if (qLower.includes('verification') || qLower.includes('id card') || qLower.includes('verify')) {
    return SUPPORT_PRESET_QUESTIONS[0].answer;
  }
  if (qLower.includes('meeting') || qLower.includes('meet link')) {
    return SUPPORT_PRESET_QUESTIONS[1].answer;
  }
  if (qLower.includes('refund') || qLower.includes('paisa') || qLower.includes('return')) {
    return SUPPORT_PRESET_QUESTIONS[2].answer;
  }
  if (qLower.includes('sasta') || qLower.includes('budget') || qLower.includes('price')) {
    return SUPPORT_PRESET_QUESTIONS[3].answer;
  }
  if (qLower.includes('custom') || qLower.includes('new project') || qLower.includes('banwana')) {
    return SUPPORT_PRESET_QUESTIONS[4].answer;
  }
  if (qLower.includes('utr') || qLower.includes('delivery') || qLower.includes('zip') || qLower.includes('payment')) {
    return SUPPORT_PRESET_QUESTIONS[5].answer;
  }

  return 'Aapka support ticket receive ho gaya hai. Admin team 1 se 24 hours ke andar aapse contact karegi. Urgent help ke liye aap direct marketplacep6@gmail.com par email bhej sakte hain.';
}

export function matchSupportAutoReply(subject: string, description?: string, category?: string): string {
  const query = `${subject || ''} ${description || ''} ${category || ''}`.trim();
  return getPresetAnswer(query);
}
