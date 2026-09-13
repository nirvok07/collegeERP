/**
 * WEB-1: accepting a college invitation. The console's link carries both
 * values (`/accept-invite?college=<code>&token=<token>`); a person who got them
 * as a message types them instead. The server is the authority on all of it.
 */
export function collegeInviteFrom(search: string): { college: string; token: string } {
  const params = new URLSearchParams(search);
  return {
    college: (params.get('college') ?? '').trim().toLowerCase(),
    token: (params.get('token') ?? '').trim(),
  };
}

export interface AcceptForm {
  college: string;
  token: string;
  password: string;
  again: string;
}

/** The first obvious problem, in the words the server would use. */
export function acceptFormError(form: AcceptForm): string | null {
  if (!form.college.trim()) return 'Enter your college code.';
  if (!form.token.trim()) return 'Enter the invitation code from your message.';
  if (form.password.length < 10 || !/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
    return 'Use at least ten characters, with a letter and a number.';
  }
  if (form.password !== form.again) return 'The passwords do not match.';
  return null;
}
