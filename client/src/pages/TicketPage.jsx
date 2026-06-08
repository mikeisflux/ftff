import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

// Mobile ticket page (§8): big QR for on-site scanning + status. Wallet-friendly
// single-column layout. The QR encodes the opaque validation URL.
export default function TicketPage() {
  const { token } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['ticket', token],
    queryFn: () => api(`/t/${token}`),
    retry: false,
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <div className="section container"><p className="muted">Loading ticket…</p></div>;
  if (error) {
    return (
      <div className="section container">
        <h1 className="glow">Ticket not found</h1>
        <p className="muted">This ticket link is invalid.</p>
      </div>
    );
  }

  const t = data.ticket;
  const statusColor =
    t.status === 'valid' ? 'var(--color-success)'
    : t.status === 'checked_in' ? 'var(--color-muted)'
    : 'var(--color-danger)';

  return (
    <div className="section container" style={{ maxWidth: 420, textAlign: 'center' }}>
      <div className="card">
        <h1 className="glow" style={{ marginTop: 0 }}>{t.ticketName}</h1>
        <p className="muted">{t.attendeeName}</p>
        <img src={t.qr} alt="Ticket QR code" style={{ width: '100%', maxWidth: 320, borderRadius: 12, background: '#fff', padding: 12 }} />
        <p style={{ color: statusColor, fontWeight: 700, marginTop: 12 }}>
          {t.status === 'valid' && 'Valid — ready to scan'}
          {t.status === 'checked_in' && `Checked in${t.checkedInAt ? ' · ' + new Date(t.checkedInAt).toLocaleString() : ''}`}
          {t.status === 'void' && 'Void'}
        </p>
        <p className="muted" style={{ fontSize: '.85rem' }}>Order {t.orderNumber}</p>
        {t.isDigital && <p className="muted">Digital — grants Virtual Con access.</p>}
      </div>
    </div>
  );
}
