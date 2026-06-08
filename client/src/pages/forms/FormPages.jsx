import { useState } from 'react';
import ContactForm from '../../components/ContactForm.jsx';
import { api } from '../../lib/api.js';

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
        endpoint="/contact"
        intro="Who would you love to see at the show? Let us know."
        subjectDefault="Guest Suggestion"
        buttonLabel="Send Suggestion"
        successMessage="Thanks for the suggestion!"
      />
    </Page>
  );
}

export function Newsletter() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      await api('/newsletter', { method: 'POST', body: { email } });
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
