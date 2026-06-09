import { useState } from 'react';
import ContactForm from '../../components/ContactForm.jsx';
import { api } from '../../lib/api.js';
import { useConfig } from '../../store/ConfigContext.jsx';

// Thin wrappers around the reusable ContactForm, one per public endpoint (§7.2).
function Page({ title, children }) {
  return (
    <div className="section container" style={{ maxWidth: 720 }}>
      <h1 className="glow">{title}</h1>
      {children}
    </div>
  );
}

export function Contact() {
  return (
    <Page title="Contact Us">
      <ContactForm endpoint="/contact" intro="Questions about the show? Send us a message." />
    </Page>
  );
}

export function MediaInquiries() {
  return (
    <Page title="Media Inquiries">
      <ContactForm
        endpoint="/media-inquiry"
        intro="Press and media — request credentials or an interview."
        showCompany
        subjectDefault="Media Inquiry"
        buttonLabel="Submit Inquiry"
        successMessage="Thanks — our media team will follow up."
      />
    </Page>
  );
}

export function Exhibitor() {
  return (
    <Page title="Become an Exhibitor">
      <ContactForm
        endpoint="/exhibitor-application"
        intro="Tell us about your business and what you'd like to exhibit."
        showCompany
        subjectDefault="Exhibitor Application"
        buttonLabel="Apply"
        successMessage="Thanks — our exhibitor team will be in touch with availability."
      />
    </Page>
  );
}

export function SuggestGuest() {
  return (
    <Page title="Suggest a Guest">
      <ContactForm
        endpoint="/apply/suggest_guest"
        intro="Who would you love to see at the show? Let us know."
        subjectDefault="Guest Suggestion"
        buttonLabel="Send Suggestion"
        successMessage="Thanks for the suggestion!"
      />
    </Page>
  );
}

// Apply-section application forms (§7.0) → /apply/:kind.
export function PanelSubmission() {
  return (
    <Page title="Panel Submission">
      <ContactForm endpoint="/apply/panel" subjectDefault="Panel Submission" buttonLabel="Submit Panel"
        intro="Pitch your panel. Include the title, format, length, panelists, and a short description in your message." />
    </Page>
  );
}
export function Crew() {
  return (
    <Page title="Join the Crew">
      <ContactForm endpoint="/apply/crew" subjectDefault="Crew Application" buttonLabel="Apply to Crew"
        intro="Want to volunteer on crew? Tell us your availability, interests, and any relevant experience." />
    </Page>
  );
}
export function ProfessionalCreators() {
  return (
    <Page title="Professional Creators">
      <ContactForm endpoint="/apply/creator" showCompany subjectDefault="Professional Creator Application" buttonLabel="Apply"
        intro="Comic creators, artists, and writers — tell us about your work and links to your portfolio." />
    </Page>
  );
}
export function CosplayGuest() {
  return (
    <Page title="Cosplay Guest">
      <ContactForm endpoint="/apply/cosplay_guest" subjectDefault="Cosplay Guest Application" buttonLabel="Apply"
        intro="Interested in appearing as a cosplay guest? Share your socials, following, and what you'd bring to the show." />
    </Page>
  );
}
export function Community() {
  return (
    <Page title="Community">
      <ContactForm endpoint="/apply/community" showCompany subjectDefault="Community Inquiry" buttonLabel="Get Involved"
        intro="Community groups, clubs, and nonprofits — tell us how you'd like to participate." />
    </Page>
  );
}

// Newsletter double opt-in result pages.
export function NewsletterConfirmed() {
  return <Page title="You're subscribed! 🎉"><div className="card"><p>Thanks for confirming — you'll hear from us soon.</p></div></Page>;
}
export function NewsletterUnsubscribed() {
  return <Page title="Unsubscribed"><div className="card"><p>You've been removed from the list. Sorry to see you go!</p></div></Page>;
}
export function NewsletterInvalid() {
  return <Page title="Link expired"><div className="card"><p className="muted">That confirmation link is invalid or expired. Please sign up again.</p></div></Page>;
}

export function Newsletter() {
  const { getRecaptchaToken } = useConfig();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const recaptchaToken = await getRecaptchaToken('newsletter');
      await api('/newsletter', { method: 'POST', body: { email, ...(recaptchaToken ? { recaptchaToken } : {}) } });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Something went wrong.');
    }
  }

  return (
    <Page title="Newsletter Sign Up">
      {status === 'sent' ? (
        <div className="card" role="status">
          <p style={{ color: 'var(--color-success)' }}>
            ✓ You’re on the list. We’ll send show news and announcements your way.
          </p>
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          <p className="muted">Get show announcements, guest reveals, and ticket alerts.</p>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {status === 'error' && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <div style={{ marginTop: 16 }}>
            <button className="btn" disabled={status === 'sending'}>
              {status === 'sending' ? 'Signing up…' : 'Sign Up'}
            </button>
          </div>
        </form>
      )}
    </Page>
  );
}
