import { Student, Lesson, Charge } from './types';
import { Money } from './money';

export interface ReminderParams {
  student: Student;
  tutorName?: string;
  lesson?: Lesson;
  charge?: Charge;
  customAmountGrosze?: number;
}

export const DEFAULT_LESSON_REMINDER_TEMPLATE =
  'Cześć {student_name}, przypominam o lekcji {subject} {lesson_date} o godz. {lesson_time}. Do zobaczenia!';

export const DEFAULT_PAYMENT_REMINDER_TEMPLATE =
  'Dzień dobry, przypominam o nierozliczonej lekcji ({student_name}) z dnia {lesson_date} na kwotę {amount} zł. Pozdrawiam, {tutor_name}';

/**
 * Formats a phone number for Polish tel/SMS and WhatsApp links (+48).
 */
export function formatPhoneNumber(phone: string): { clean: string; international: string } {
  const digits = phone.replace(/\D/g, '');
  let international = digits;
  if (digits.length === 9) {
    international = `48${digits}`;
  } else if (digits.startsWith('0048')) {
    international = digits.slice(2);
  }
  return { clean: digits, international };
}

/**
 * Builds lesson reminder message from template.
 */
export function buildLessonReminderText(
  params: ReminderParams,
  template = DEFAULT_LESSON_REMINDER_TEMPLATE
): string {
  const { student, lesson } = params;
  const studentName = student.first_name || 'Uczniu';
  const subject = lesson?.subject || student.subject || 'matematyki';

  let lessonDate = 'wkrótce';
  let lessonTime = 'ustalonej porze';

  if (lesson?.start_at) {
    const [d, t] = lesson.start_at.split('T');
    lessonDate = d;
    if (t) lessonTime = t.slice(0, 5);
  }

  return template
    .replace('{student_name}', studentName)
    .replace('{subject}', subject)
    .replace('{lesson_date}', lessonDate)
    .replace('{lesson_time}', lessonTime);
}

/**
 * Builds payment reminder message from template.
 */
export function buildPaymentReminderText(
  params: ReminderParams,
  template = DEFAULT_PAYMENT_REMINDER_TEMPLATE
): string {
  const { student, tutorName = 'Korepetytor', charge, customAmountGrosze } = params;
  const lessonDate = charge?.accrual_date || 'ostatniej lekcji';
  const amountGrosze = customAmountGrosze ?? charge?.amount ?? 7000;
  const amountStr = Money.format(amountGrosze, false);

  return template
    .replace('{student_name}', student.first_name)
    .replace('{lesson_date}', lessonDate)
    .replace('{amount}', amountStr)
    .replace('{tutor_name}', tutorName);
}

/**
 * Generates direct SMS uri (sms:+48XXXXXXXXX?body=...)
 */
export function generateSmsLink(phone: string, message: string): string {
  const { international } = formatPhoneNumber(phone);
  const prefix = international.startsWith('+') ? international : `+${international}`;
  return `sms:${prefix}?body=${encodeURIComponent(message)}`;
}

/**
 * Generates direct WhatsApp click-to-chat URL (https://wa.me/48XXXXXXXXX?text=...)
 */
export function generateWhatsAppLink(phone: string, message: string): string {
  const { international } = formatPhoneNumber(phone);
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}
