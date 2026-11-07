export type Role = 'admin' | 'student';
export type Currency = 'GBP' | 'USD' | 'EUR' | 'AUD';
export const CURRENCIES: Currency[] = ['GBP', 'USD', 'EUR', 'AUD'];

export type Profile = {
  id: string;
  role: Role;
  student_id: string | null;
  email: string | null;
  full_name: string | null;
  created_at?: string;
  can_invite?: boolean;
};

export type Trust = { id: string; name: string };

export type StudentStatus = 'active' | 'paused' | 'completed' | 'withdrawn';

export type Student = {
  id: string;
  code: string;
  status: StudentStatus;
  full_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  nic: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  school: string | null;
  guardian_details: string | null;
  family_situation: string | null;
  ambition: string | null;
  photo_bucket: string | null;
  photo_path: string | null;
  application_id: string | null;
  access_code: string | null;
  access_code_expires: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseStatus = 'ongoing' | 'completed' | 'paused' | 'withdrawn';

export type Course = {
  id: string;
  student_id: string;
  trust_id: string | null;
  title: string;
  institution: string | null;
  awarding_body: string | null;
  start_date: string | null;
  duration_years: number | null;
  payment_plan: string | null;
  total_fee_lkr: number;
  total_fee_foreign: number;
  foreign_currency: Currency | null;
  status: CourseStatus;
  notes: string | null;
  created_at: string;
};

export type Instalment = {
  id: string;
  course_id: string;
  student_id: string;
  label: string;
  due_date: string | null;
  amount_lkr: number;
  amount_foreign: number;
  foreign_currency: Currency | null;
  funded_by: 'trust' | 'self';
  status: 'due' | 'paid' | 'cancelled';
  notes: string | null;
  created_at: string;
};

export type Payment = {
  id: string;
  student_id: string;
  course_id: string | null;
  instalment_id: string | null;
  trust_id: string | null;
  paid_on: string;
  amount_lkr: number;
  amount_foreign: number;
  foreign_currency: Currency | null;
  fx_rate: number | null;
  total_lkr: number;
  method: string | null;
  paid_to: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

export type DocCategory =
  | 'photo' | 'identity' | 'certificate' | 'results' | 'invoice' | 'cheque' | 'receipt' | 'fee_schedule' | 'application' | 'income' | 'other';

export const DOC_CATEGORIES: { value: DocCategory; label: string }[] = [
  { value: 'invoice', label: 'Invoice / fee demand' },
  { value: 'cheque', label: 'Cheque / money from the trust' },
  { value: 'receipt', label: 'Payment receipt' },
  { value: 'results', label: 'Semester / exam results' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'fee_schedule', label: 'Course & fee schedule' },
  { value: 'identity', label: 'ID / birth certificate' },
  { value: 'income', label: 'Family income proof' },
  { value: 'application', label: 'Application document' },
  { value: 'photo', label: 'Photo' },
  { value: 'other', label: 'Other' },
];

/** What a student may upload to their own file (matches the database rule). */
export const STUDENT_UPLOAD_CATEGORIES: DocCategory[] = ['invoice', 'cheque', 'results', 'receipt', 'certificate', 'other'];

/** The steps of one payment, in the order they happen. Each step gets its own photo. */
export const PROOF_STEPS: { value: DocCategory; label: string; hint: string }[] = [
  { value: 'invoice', label: 'Invoice from the institution', hint: 'The fee demand that says what is owed' },
  { value: 'cheque', label: 'Cheque or money from the trust', hint: 'A photo of the cheque, or the transfer slip' },
  { value: 'receipt', label: 'Receipt from the institution', hint: 'Proof the fee was paid' },
];

/** Where a document sits in the payment schedule, if anywhere. */
export type DocLink = { instalment_id?: string | null; payment_id?: string | null };

export type DocumentRec = {
  id: string;
  student_id: string;
  bucket: 'files' | 'applications';
  path: string;
  category: DocCategory;
  title: string;
  mime: string | null;
  size_bytes: number | null;
  uploaded_by_role: 'admin' | 'student' | 'applicant';
  instalment_id?: string | null;
  payment_id?: string | null;
  created_at: string;
};

export type Note = { id: string; student_id: string; body: string; author_name: string | null; created_at: string };

export type ApplicationStatus = 'new' | 'reviewing' | 'interview' | 'accepted' | 'declined';

export type ApplicationFile = { field: string; label: string; name: string; path: string; mime: string; size: number };

export type Application = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  full_name: string;
  email: string | null;
  phone: string | null;
  answers: Record<string, unknown>;
  files: ApplicationFile[];
  review_notes: string | null;
  student_id: string | null;
  created_at: string;
};

/** Everything a trustee's overview needs (the trust is small enough to load at once). */
export type Overview = {
  trusts: Trust[];
  students: Student[];
  courses: Course[];
  instalments: Instalment[];
  payments: Payment[];
  applications: Application[];
};

export type StudentBundle = {
  student: Student;
  courses: Course[];
  instalments: Instalment[];
  payments: Payment[];
  documents: DocumentRec[];
  notes: Note[];
  logins: Profile[];
  trusts: Trust[];
};

export type TrusteeInvite = {
  id: string;
  code: string;
  label: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_email: string | null;
};

export type TrusteesPage = { trustees: Profile[]; invites: TrusteeInvite[] };
