// All site copy lives here so the family can edit wording without touching components.

/** Public contact address. Empty = no address is shown (applicants reply to their confirmation email instead). */
export const CONTACT_EMAIL = '';

/** The committee's applications sheet. Google sign-in protects it; only people it is shared with can open it. */
export const COMMITTEE_URL =
  (import.meta.env.VITE_COMMITTEE_URL as string | undefined) ||
  'https://docs.google.com/spreadsheets/d/1uLx0Iexc-F8HWYVGymmqYc9bamQkKSHtpkL7ojXU46k/edit';

export const HERO_VIDEO =
  import.meta.env.VITE_HERO_VIDEO ||
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4';

export const APPLY_VIDEO =
  import.meta.env.VITE_APPLY_VIDEO ||
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_202655_a7f5aca0-2f80-4bc9-bcb5-96ac95662003.mp4';

export const navItems = [
  { id: 'how', label: 'How it works' },
  { id: 'who', label: 'Who we support' },
  { id: 'family', label: 'Our family' },
];

export type Step = { n: string; title: string; body: string; time: string; detail: string };

export const steps: Step[] = [
  {
    n: '01',
    title: 'Submit your application',
    body: 'A short conversation on this site — one question at a time. Photos of documents are fine.',
    time: '~15 min',
    detail:
      'Five short stages — your profile, education, plans, the costs, and a sign-off — taken at your own pace. Your answers are kept on your device as you go, so you can leave and come back.',
  },
  {
    n: '02',
    title: 'Reference number, right away',
    body: "You get a unique reference the moment you finish. Keep it — it's how you write to us and how we find your file quickly.",
    time: 'Immediate',
    detail:
      'The reference is generated on submission and shown on-screen. Save it — every subsequent conversation with the Committee references it.',
  },
  {
    n: '03',
    title: 'The Committee reads it',
    body: "Altaf and Imran read every application themselves. If something is unclear, they'll write to you before deciding.",
    time: 'Read in full',
    detail:
      'No algorithms, no first-round filter, no outsourced reviewers. Two people read the file, discuss it, and follow up personally when the story needs more context.',
  },
  {
    n: '04',
    title: 'A decision, by email',
    body: 'A yes, a no, or a question if we need to know more. We write back to everyone who applies.',
    time: 'By email',
    detail:
      'Where it helps, the decision comes with a short note. If it isn’t a yes this time, you are welcome to apply again later with an update.',
  },
  {
    n: '05',
    title: 'Funding & follow-through',
    body: 'If approved, we agree together how and when the support is paid, and stay in touch along the way.',
    time: 'Ongoing',
    detail:
      'Support is usually paid by term or by milestone — whatever fits the need. We keep in touch lightly; no invasive reporting.',
  },
];

export type Pillar = { id: string; title: string; body: string; examples: string[] };

export const pillars: Pillar[] = [
  {
    id: 'students',
    title: 'Students',
    body: 'Sri Lankan students in secondary, tertiary, or vocational programmes — anyone with a real course and a real financial gap.',
    examples: ['O/L and A/L exam fees, tuition, transport', 'University tuition and hostel costs', 'Vocational and technical diplomas'],
  },
  {
    id: 'talents',
    title: 'Talents',
    body: 'Sports, music, arts, sciences — applicants developing a serious skill who need equipment, coaching, or fees covered to keep going.',
    examples: ['Coaching fees, competition travel, kit', 'Instruments, studio time, exam grades', 'Materials, entrance portfolios, tutoring'],
  },
  {
    id: 'determined',
    title: 'Determined applicants',
    body: 'Determination matters more than pedigree. The Committee decides — if you are unsure whether you qualify, apply anyway.',
    examples: ['Adults returning to complete an education', 'First-in-family university applicants', 'Applicants outside traditional pipelines'],
  },
];

export const family = [
  {
    initials: 'AJ',
    name: 'Altaf Jeevunjee',
    role: 'Scholarship Committee',
    bio: 'Founding member of the initiative. Reads every application himself and follows up personally where the file needs a conversation.',
  },
  {
    initials: 'IJ',
    name: 'Imran Jeevunjee',
    role: 'Scholarship Committee',
    bio: "Founding member of the initiative. Oversees the review process and the secure handling of every applicant's documents.",
  },
];
