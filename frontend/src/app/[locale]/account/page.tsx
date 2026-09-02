import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: profile edit (name, phone), saved addresses.
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'حسابي' : 'My Account'} />;
}
