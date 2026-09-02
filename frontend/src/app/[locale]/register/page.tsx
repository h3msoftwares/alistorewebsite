import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: registration form -> POST /api/auth/register. Guest checkout
// remains available without this — see project guide.
export default function RegisterPage({ params }: { params: { locale: string } }) {
  return <PagePlaceholder title={params.locale === 'ar' ? 'إنشاء حساب' : 'Create Account'} />;
}
