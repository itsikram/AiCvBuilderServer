// Accounts whose email is in AUTO_ADMIN_EMAILS become admin. Only verified emails qualify,
// so nobody can claim admin by registering the address first.
export const qualifiesForAutoAdmin = (
  user: { role: string; email: string; isEmailVerified: boolean },
  autoAdminEmails: readonly string[]
) => user.role !== "admin" && user.isEmailVerified && autoAdminEmails.includes(user.email.trim().toLowerCase());
