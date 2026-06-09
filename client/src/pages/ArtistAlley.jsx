import ExhibitorInfoPage from './ExhibitorInfoPage.jsx';

const FAQS = [
  { q: 'How do I apply for Artist Alley?', a: 'Click “Become an Exhibitor,” complete the application, agree to the terms, choose your table, and submit payment. Your spot is not guaranteed until show management approves your application and you receive an acceptance email.' },
  { q: 'Who can apply?', a: 'Amateur and professional creators who make original artwork, commissions, prints, sculptures, jewelry, pins, buttons, and other handmade work.' },
  { q: 'What comes with a space?', a: 'Each space includes a table and two chairs. Additional tables are available for an extra fee while supplies last.' },
  { q: 'Can I pay a deposit and pay the rest later?', a: 'Yes. A deposit (50% of your booth plus 60% of any add-ons) reserves your space; we’ll email you a link to pay the balance before the show.' },
];

export default function ArtistAlley() {
  return (
    <ExhibitorInfoPage
      title="Artist Alley"
      tagline="Are you a creator who makes one-of-a-kind artwork, commissions, sculptures, jewelry, pins, and buttons? Share your art — apply for Artist Alley."
      intro="Artist Alley is the heart of the show. Set up your table, meet fans face to face, and sell your original work all weekend long."
      faqs={FAQS}
    />
  );
}
