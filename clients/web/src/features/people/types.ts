export interface Person {
  person_id: string;
  full_name: string;
  email: string | null;
  person_type: 'staff' | 'student' | 'guardian' | 'applicant' | 'external';
  account_status: string | null;
  last_login_at: string | null;
  role_keys: string[];
}

export interface Role {
  key: string;
  name: string;
  allowed_scope_types: string[];
  permission_count: number;
  /** Plain-language sentence from the server, shown instead of a permission list. */
  summary: string;
}

export interface Assignment {
  id: string;
  person_id: string;
  person_name: string;
  role_key: string;
  role_name: string;
  scope_type: string;
  scope_ref_id: string | null;
  valid_to: string | null;
  source: string;
  granted_at: string;
}
