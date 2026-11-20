/**
 * Customer Support Service
 * Handles keyword-matching instant auto-replies and support ticket helper methods.
 */

export const SUPPORT_OFFICIAL_EMAIL = 'marketplacep6@gmail.com';

export const AUTO_REPLY_RESPONSES = {
  studentIdVerification:
    'Student ID verification Admin ke end se **1 se 24 hours** ke andar complete ho jayega. Agar 24 hours se zyada ho gaye hain toh kripya apna Student ID code ke saath **`marketplacep6@gmail.com`** par email karein.',
  refundPolicy:
    'Agar aapko abhi tak project source code / ZIP file nahi mili hai toh refund possible hai. Lekin agar bill generate ho chuka hai aur project files email/deliver ho gayi hain, toh digital source code copy hone ke kaaran refund nahi hoga. Admin aapse jald hi contact karega, ya aap direct **`marketplacep6@gmail.com`** par email kar sakte hain.',
  meetingLink:
    'Aapka 5-minute Google Meet link **1 se 24 hours** ke andar schedule karke **5-Min Meet** page par update kar diya jayega (link milne ke baad maximum waiting time 10 minutes rahega). Agar session urgent hai toh kripya Admin ko **`marketplacep6@gmail.com`** par email karein.',
  lowBudgetProject:
    'Saste ya budget-friendly project ke liye kripya **`marketplacep6@gmail.com`** par email karein aur batayein ki aapko kis topic aur technology stack par project chahiye—humari team aapko best available option share karegi.',
  customProjectRequest:
    'Agar aapko apne topic par naya custom project banwana hai, toh kripya apna synopsis/requirements aur deadline likh kar **`marketplacep6@gmail.com`** par email karein. Humari technical team jald hi aapse contact karegi.',
  defaultFallback:
    'Aapka support ticket receive ho gaya hai. Admin team **1 se 24 hours** ke andar aapse contact karegi. Urgent help ke liye aap direct **`marketplacep6@gmail.com`** par email bhej sakte hain.',
};

export function matchSupportAutoReply(subject: string, description: string, category: string = ''): string {
  const combined = `${subject} ${description} ${category}`.toLowerCase();

  // 1. Student ID Verification (verification, verify, id card, kab hoga, approve, pending)
  const idKeywords = ['verification', 'verify', 'id card', 'kab hoga', 'approve', 'pending'];
  if (idKeywords.some((kw) => combined.includes(kw))) {
    return AUTO_REPLY_RESPONSES.studentIdVerification;
  }

  // 2. Refund Policy (refund, paisa, return, money back, cancel)
  const refundKeywords = ['refund', 'paisa', 'return', 'money back', 'cancel'];
  if (refundKeywords.some((kw) => combined.includes(kw))) {
    return AUTO_REPLY_RESPONSES.refundPolicy;
  }

  // 3. Meeting Link (meeting, meet link, link nahi aaya, schedule, 5-min, google meet)
  const meetingKeywords = ['meeting', 'meet link', 'link nahi aaya', 'schedule', '5-min', 'google meet'];
  if (meetingKeywords.some((kw) => combined.includes(kw))) {
    return AUTO_REPLY_RESPONSES.meetingLink;
  }

  // 4. Low-Budget / Affordable Project (sasta, cheap, budget, kam price, discount, price)
  const budgetKeywords = ['sasta', 'cheap', 'budget', 'kam price', 'discount', 'price'];
  if (budgetKeywords.some((kw) => combined.includes(kw))) {
    return AUTO_REPLY_RESPONSES.lowBudgetProject;
  }

  // 5. Custom Project Request (custom, new project, naya project, apna topic, banwana)
  const customKeywords = ['custom', 'new project', 'naya project', 'apna topic', 'banwana'];
  if (customKeywords.some((kw) => combined.includes(kw))) {
    return AUTO_REPLY_RESPONSES.customProjectRequest;
  }

  // 6. Default Fallback
  return AUTO_REPLY_RESPONSES.defaultFallback;
}
