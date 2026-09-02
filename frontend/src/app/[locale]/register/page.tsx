import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: registration form -> POST /api/auth/register. Guest checkout
// remains available without this — see project guide.
export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'إنشاء حساب' : 'Create Account'} />;
}
