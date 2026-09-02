import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: profile edit (name, phone), saved addresses.
export default function AccountPage({ params }: { params: { locale: string } }) {
  return <PagePlaceholder title={params.locale === 'ar' ? 'حسابي' : 'My Account'} />;
}
